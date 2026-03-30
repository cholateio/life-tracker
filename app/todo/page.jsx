// app/todo/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import RecordPageLayout from '@/components/layout/RecordPageLayout';
import { FormInput } from '@/components/ui/FormInput';
import DatePicker from '@/components/ui/DatePicker';
import SubmitButton from '@/components/ui/SubmitButton';
import { useAuth } from '@/hooks/useAuth';

import { Plus, X, Calendar } from 'lucide-react';

export default function TodoPage() {
    const { isAuthenticated, isChecking } = useAuth();

    const [todoList, setTodoList] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 輔助函式：取得今天的 7 天後日期字串 (YYYY-MM-DD)
    const getDefaultDueDate = () => {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        return date.toISOString().split('T')[0];
    };

    // 表單狀態：移除 category，並將 due_date 預設為 7 天後
    const [formData, setFormData] = useState({
        content: '',
        due_date: getDefaultDueDate(),
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const sortTodo = (list) => {
        return [...list].sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
        });
    };

    // 輔助函式：將日期轉換為「剩餘天數」的顯示文字與樣式
    const getDaysRemainingInfo = (dateString) => {
        if (!dateString) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // 歸零時間，只比較日期
        const due = new Date(dateString);
        due.setHours(0, 0, 0, 0);

        // 計算相差天數
        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
            return { text: `剩 ${diffDays} 天`, style: 'opacity-70' };
        } else if (diffDays === 0) {
            return { text: '今日', style: 'opacity-100 font-bold' };
        } else {
            // 借用一點點紅色的透明度來暗示過期，但不破壞整體色系
            return { text: `過 ${Math.abs(diffDays)} 天`, style: 'text-red-800/70 font-bold' };
        }
    };

    const fetchTodo = async () => {
        try {
            setIsLoading(true);
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from('Todo')
                .select('*')
                .or(`is_completed.eq.false,and(is_completed.eq.true,completed_at.gte.${yesterday})`)
                .order('due_date', { ascending: true, nullsFirst: false });

            if (error) throw error;
            setTodoList(data);
        } catch (err) {
            toast.error('無法載入待辦事項');
            console.error('Fetch fail:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTodo();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isAuthenticated) return toast.error('請先登入系統才能新增事項！');
        if (!formData.content) return toast.error('請填寫事項內容');

        try {
            setIsSubmitting(true);
            const { data, error } = await supabase
                .from('Todo')
                .insert([
                    {
                        content: formData.content,
                        due_date: formData.due_date || null,
                        is_completed: false,
                    },
                ])
                .select();

            if (error) throw error;

            setTodoList((prev) => sortTodo([...prev, data[0]]));
            // 重置表單，期限再次給予 7 天後的預設值
            setFormData({ content: '', due_date: getDefaultDueDate() });
            setIsModalOpen(false);
            toast.success('事項已新增');
        } catch (err) {
            console.error('Insert fail:', err);
            toast.error('新增失敗，請檢查權限或稍後再試');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleTodo = async (id, currentStatus) => {
        const newStatus = !currentStatus;
        const timestamp = newStatus ? new Date().toISOString() : null;

        setTodoList((prev) =>
            prev.map((item) => (item.id === id ? { ...item, is_completed: newStatus, completed_at: timestamp } : item)),
        );

        try {
            const { error } = await supabase
                .from('Todo')
                .update({ is_completed: newStatus, completed_at: timestamp })
                .eq('id', id);

            if (error) throw error;
        } catch (err) {
            console.error('Update fail:', err);
            toast.error('狀態更新失敗');
            fetchTodo();
        }
    };

    const activeTodo = todoList.filter((item) => !item.is_completed);
    const completedTodo = todoList.filter((item) => item.is_completed);

    return (
        <RecordPageLayout title="Daily Task">
            <div className="max-w-4xl mx-auto w-full pb-24 text-[#3f4a4e]">
                <p className="opacity-70 mb-8 text-sm tracking-wide">生活雜事收納區</p>

                {/* --- 進行中事項清單 --- */}
                {isLoading ? (
                    <div className="space-y-4">
                        <div className="h-16 border-2 border-[#3f4a4e]/10 rounded-2xl animate-pulse"></div>
                        <div className="h-16 border-2 border-[#3f4a4e]/10 rounded-2xl animate-pulse"></div>
                    </div>
                ) : activeTodo.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed border-[#3f4a4e]/20 rounded-2xl">
                        <p className="text-[#3f4a4e]/50 font-bold tracking-widest text-sm uppercase">No Task Pending</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {activeTodo.map((item) => {
                            const daysInfo = getDaysRemainingInfo(item.due_date);
                            return (
                                <li
                                    key={item.id}
                                    className="flex items-center gap-4 p-4 rounded-2xl border-2 border-[#3f4a4e]/10 hover:border-[#3f4a4e]/30 hover:bg-[#3f4a4e]/5 transition-all"
                                >
                                    <input
                                        type="checkbox"
                                        checked={false}
                                        className="w-5 h-5 rounded border-2 border-[#3f4a4e]/40 accent-[#3f4a4e] cursor-pointer shrink-0"
                                        onChange={() => toggleTodo(item.id, item.is_completed)}
                                    />
                                    <p className="flex-1 text-sm line-clamp-2" title={item.content}>
                                        {item.content}
                                    </p>

                                    {/* 動態渲染天數與樣式 */}
                                    <div className="flex items-center gap-4 text-sm shrink-0">
                                        {daysInfo && (
                                            <span
                                                className={`flex items-center gap-1.5 font-mono tracking-wide ${daysInfo.style}`}
                                            >
                                                <Calendar size={14} />
                                                {daysInfo.text}
                                            </span>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {/* --- 待定區 (近期完成) --- */}
                {completedTodo.length > 0 && (
                    <div className="mt-12 pt-8 border-t-2 border-dashed border-[#3f4a4e]/20">
                        <h2 className="text-sm font-bold tracking-widest uppercase opacity-50 mb-4">Recently Completed</h2>
                        <ul className="space-y-3">
                            {completedTodo.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex items-center gap-4 p-4 rounded-2xl border-2 border-[#3f4a4e]/5 bg-[#3f4a4e]/5 opacity-60 hover:opacity-100 transition-all"
                                >
                                    <input
                                        type="checkbox"
                                        checked={true}
                                        className="w-5 h-5 rounded border-2 border-[#3f4a4e]/40 accent-[#3f4a4e] cursor-pointer shrink-0"
                                        onChange={() => toggleTodo(item.id, item.is_completed)}
                                    />
                                    <p className="flex-1 text-sm truncate line-through" title={item.content}>
                                        {item.content}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-8 right-8 w-14 h-14 bg-[#3f4a4e] text-[#E5E0DC] rounded-full shadow-lg text-2xl flex items-center justify-center hover:bg-[#2c3437] transition-colors focus:outline-none z-40"
            >
                <Plus size={28} />
            </button>

            {/* --- 新增表單 Modal --- */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-[#3f4a4e]/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-[#E5E0DC] rounded-3xl p-8 w-full max-w-lg shadow-2xl relative border-2 border-[#3f4a4e]/10">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute top-6 right-6 text-[#3f4a4e]/50 hover:text-[#3f4a4e] p-1 transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <h2 className="text-2xl font-bold mb-8 tracking-tight text-[#3f4a4e]">Add New Task</h2>

                        <form onSubmit={handleSubmit} className="space-y-6 flex flex-col">
                            <FormInput
                                label="Content"
                                name="content"
                                placeholder="例如：整理 GCP 帳號、訂演唱會門票..."
                                value={formData.content}
                                onChange={handleChange}
                            />

                            {/* 將日期選擇器展開，因為分類移除了，不用再擠在 grid 裡 */}
                            <div className="w-full">
                                <DatePicker
                                    label="Due Date (預設 7 天後)"
                                    value={formData.due_date}
                                    onChange={(val) => setFormData((prev) => ({ ...prev, due_date: val }))}
                                />
                            </div>

                            {isChecking ? (
                                <div className="h-15 flex items-center justify-center opacity-50">檢查權限中...</div>
                            ) : isAuthenticated ? (
                                <SubmitButton loading={isSubmitting} text="SAVE TASK" />
                            ) : (
                                <div className="flex items-center justify-center bg-[#3f4a4e]/5 text-[#3f4a4e]/50 border-2 border-dashed border-[#3f4a4e]/20 px-6 py-2 rounded-2xl font-bold tracking-widest text-sm uppercase">
                                    <span>Admin Only</span>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            )}
        </RecordPageLayout>
    );
}
