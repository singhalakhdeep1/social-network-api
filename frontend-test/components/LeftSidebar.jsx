export default function LeftSidebar({ currentUser, users, onFollow }) {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-md sticky top-5">
            <div className="mb-6">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white cursor-pointer">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-semibold">
                        {currentUser?.name?.charAt(0)}
                    </div>
                    <div>
                        <div className="font-semibold">{currentUser?.name}</div>
                        <div className="text-xs opacity-80">@{currentUser?.username}</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="text-center p-3">
                    <div className="text-2xl font-bold text-gray-800">128</div>
                    <div className="text-xs text-gray-600">Posts</div>
                </div>
                <div className="text-center p-3">
                    <div className="text-2xl font-bold text-gray-800">1.2K</div>
                    <div className="text-xs text-gray-600">Followers</div>
                </div>
                <div className="text-center p-3">
                    <div className="text-2xl font-bold text-gray-800">456</div>
                    <div className="text-xs text-gray-600">Following</div>
                </div>
            </div>

            <h3 className="text-base font-semibold mb-4">Suggested Users</h3>
            {users.slice(0, 5).map((user) => (
                <div key={user._id} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:bg-gray-100">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                        {user.name?.charAt(0)}
                    </div>
                    <div className="flex-1">
                        <div className="font-semibold text-sm">{user.name}</div>
                        <div className="text-xs text-gray-600">@{user.username}</div>
                    </div>
                    <button onClick={() => onFollow(user._id)} className="bg-gradient-to-r from-pink-500 to-purple-600 text-white py-1.5 px-3 rounded-lg font-semibold text-xs hover:shadow-lg transition-all">
                        Follow
                    </button>
                </div>
            ))}
        </div>
    );
}
