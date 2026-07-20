export default function RightSidebar() {
    const trendingTopics = [
        { rank: 1, topic: '#Technology', posts: '12.5K' },
        { rank: 2, topic: '#Programming', posts: '8.2K' },
        { rank: 3, topic: '#WebDev', posts: '5.7K' },
        { rank: 4, topic: '#JavaScript', posts: '4.3K' },
        { rank: 5, topic: '#AI', posts: '3.8K' }
    ];

    return (
        <div className="bg-white rounded-2xl p-6 shadow-md sticky top-5">
            <h3 className="text-base font-semibold mb-4">Trending Topics</h3>
            {trendingTopics.map((item) => (
                <div key={item.rank} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100">
                    <div className="text-2xl font-bold text-gray-400 w-8">{item.rank}</div>
                    <div>
                        <div className="font-semibold">{item.topic}</div>
                        <div className="text-xs text-gray-600">{item.posts} posts</div>
                    </div>
                </div>
            ))}
        </div>
    );
}
