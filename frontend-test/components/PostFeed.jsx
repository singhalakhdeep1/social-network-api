import PostCard from './PostCard';

export default function PostFeed({ posts, onLike }) {
    if (posts.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-xl p-6 text-center text-gray-400">
                <div className="text-6xl mb-4">📝</div>
                <h3>No posts yet</h3>
                <p>Be the first to share something!</p>
            </div>
        );
    }

    return (
        <div>
            {posts.map((post) => (
                <PostCard key={post._id} post={post} onLike={onLike} />
            ))}
        </div>
    );
}
