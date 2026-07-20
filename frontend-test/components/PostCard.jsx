import { format } from 'date-fns';

export default function PostCard({ post, onLike }) {
    return (
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white font-semibold text-base">
                    {post.author?.name?.charAt(0)}
                </div>
                <div>
                    <div className="font-semibold">{post.author?.name}</div>
                    <div className="text-xs text-gray-600">
                        {format(new Date(post.createdAt), 'MMM dd, yyyy • HH:mm')}
                    </div>
                </div>
            </div>
            <div className="mb-4 leading-relaxed text-gray-700">
                {post.content}
            </div>
            <div className="flex gap-4 pt-4 border-t border-gray-200">
                <div className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all hover:bg-gray-100 ${post.liked ? 'text-pink-500' : 'text-gray-600'}`} onClick={() => onLike(post._id)}>
                    <span>{post.liked ? '❤️' : '🤍'}</span>
                    <span>{post.likes || 0}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all hover:bg-gray-100 text-gray-600">
                    <span>💬</span>
                    <span>{post.comments?.length || 0}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all hover:bg-gray-100 text-gray-600">
                    <span>🔄</span>
                    <span>{post.shares || 0}</span>
                </div>
            </div>
            {post.comments && post.comments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                    {post.comments.slice(0, 3).map((comment) => (
                        <div key={comment._id} className="flex gap-3 py-3 border-b border-gray-100 last:border-0">
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm">
                                {comment.author?.name?.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <div className="font-semibold text-sm">
                                    {comment.author?.name}
                                </div>
                                <div className="text-sm text-gray-700">
                                    {comment.content}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
