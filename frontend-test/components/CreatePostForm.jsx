export default function CreatePostForm({ content, setContent, onSubmit, loading }) {
    return (
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <form onSubmit={onSubmit}>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="What's on your mind?"
                    className="w-full p-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-pink-500 transition-all resize-y min-h-24 mb-4"
                />
                <div className="flex justify-end">
                    <button type="submit" className="bg-gradient-to-r from-pink-500 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-60" disabled={loading || !content.trim()}>
                        {loading ? 'Posting...' : 'Post'}
                    </button>
                </div>
            </form>
        </div>
    );
}
