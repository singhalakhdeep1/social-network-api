'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import { GET_FEED, GET_ME, GET_NOTIFICATIONS, CREATE_POST, LIKE_POST, UNLIKE_POST, ADD_COMMENT, FOLLOW_USER, UNFOLLOW_USER, ADD_REACTION, POST_CREATED, COMMENT_ADDED, REACTION_ADDED } from '@/lib/graphql-queries';
import { format } from 'date-fns';
import { Heart, MessageCircle, Share2, Repeat, Send, Bell, User, TrendingUp, BarChart3, LogOut, Settings, Search, Hash, AtSign, Image as ImageIcon, Smile, MoreHorizontal } from 'lucide-react';

interface User {
  id: string;
  username: string;
  email: string;
  bio?: string;
  avatar?: string;
  followerCount: number;
  followingCount: number;
}

interface Post {
  id: string;
  content: string;
  author: User;
  media?: { url: string; type: string }[];
  hashtags: string[];
  mentions: User[];
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  createdAt: string;
}

interface FeedItem {
  post: Post;
  score: number;
  reason: string;
}

export default function SocialMediaApp() {
  const [activeTab, setActiveTab] = useState<'feed' | 'trending' | 'notifications' | 'analytics' | 'profile'>('feed');
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [showNotifications, setShowNotifications] = useState(false);

  const { data: meData } = useQuery(GET_ME);
  const { data: feedData, refetch: refetchFeed } = useQuery(GET_FEED);
  const { data: notificationsData } = useQuery(GET_NOTIFICATIONS, { variables: { limit: 10 } });
  
  const [createPost] = useMutation(CREATE_POST);
  const [likePost] = useMutation(LIKE_POST);
  const [unlikePost] = useMutation(UNLIKE_POST);
  const [addComment] = useMutation(ADD_COMMENT);
  const [followUser] = useMutation(FOLLOW_USER);
  const [unfollowUser] = useMutation(UNFOLLOW_USER);
  const [addReaction] = useMutation(ADD_REACTION);

  // Real-time subscriptions
  useSubscription(POST_CREATED, {
    onData: () => refetchFeed(),
  });

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    try {
      await createPost({ variables: { content: newPostContent } });
      setNewPostContent('');
      setSelectedImage(null);
      refetchFeed();
    } catch (error) {
      console.error('Error creating post:', error);
    }
  };

  const handleLike = async (postId: string, isLiked: boolean) => {
    try {
      if (isLiked) {
        await unlikePost({ variables: { postId } });
      } else {
        await likePost({ variables: { postId } });
      }
      refetchFeed();
    } catch (error) {
      console.error('Error liking post:', error);
    }
  };

  const handleComment = async (postId: string) => {
    const content = commentInput[postId];
    if (!content?.trim()) return;
    try {
      await addComment({ variables: { postId, content } });
      setCommentInput({ ...commentInput, [postId]: '' });
      refetchFeed();
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleReaction = async (postId: string, emoji: string) => {
    try {
      await addReaction({ variables: { postId, emoji } });
      setShowReactionPicker(null);
      refetchFeed();
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '👏', '🙏'];

  const feedItems: FeedItem[] = feedData?.feed || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Social Network
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 hover:bg-gray-100 rounded-full transition"
            >
              <Bell className="w-6 h-6 text-gray-600" />
              {notificationsData?.notifications?.filter((n: any) => !n.read).length > 0 && (
                <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {notificationsData.notifications.filter((n: any) => !n.read).length}
                </span>
              )}
            </button>
            {meData?.me && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                  {meData.me.username.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{meData.me.username}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 flex gap-8">
          {[
            { id: 'feed', label: 'Feed', icon: MessageCircle },
            { id: 'trending', label: 'Trending', icon: TrendingUp },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'profile', label: 'Profile', icon: User },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-4 px-2 border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="fixed top-16 right-4 w-80 bg-white rounded-lg shadow-xl border z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b font-semibold">Notifications</div>
          {notificationsData?.notifications?.map((notification: any) => (
            <div key={notification.id} className="p-4 border-b hover:bg-gray-50">
              <p className="text-sm">{notification.message}</p>
              <p className="text-xs text-gray-500 mt-1">
                {format(new Date(notification.createdAt), 'MMM dd, HH:mm')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-[300px_1fr_300px] gap-6">
          {/* Left Sidebar */}
          <aside className="space-y-4">
            {meData?.me && (
              <div className="bg-white rounded-xl shadow p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xl">
                    {meData.me.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold">{meData.me.username}</h3>
                    <p className="text-sm text-gray-500">{meData.me.email}</p>
                  </div>
                </div>
                <div className="flex justify-around text-center">
                  <div>
                    <p className="font-bold">{meData.me.followerCount}</p>
                    <p className="text-xs text-gray-500">Followers</p>
                  </div>
                  <div>
                    <p className="font-bold">{meData.me.followingCount}</p>
                    <p className="text-xs text-gray-500">Following</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-semibold mb-3">Trending Hashtags</h3>
              <div className="space-y-2">
                {['#technology', '#programming', '#webdev', '#react', '#graphql'].map((tag) => (
                  <button key={tag} className="block w-full text-left text-purple-600 hover:text-purple-800">
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Main Feed */}
          <div className="space-y-6">
            {/* Create Post */}
            <div className="bg-white rounded-xl shadow p-4">
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full p-3 border rounded-lg resize-none min-h-24 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div className="flex items-center justify-between mt-3">
                <div className="flex gap-2">
                  <label className="cursor-pointer p-2 hover:bg-gray-100 rounded-lg transition">
                    <ImageIcon className="w-5 h-5 text-gray-600" />
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                    <Hash className="w-5 h-5 text-gray-600" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                    <AtSign className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                <button
                  onClick={handleCreatePost}
                  disabled={!newPostContent.trim()}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-2 rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50"
                >
                  Post
                </button>
              </div>
              {selectedImage && (
                <div className="mt-3 relative">
                  <img src={URL.createObjectURL(selectedImage)} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* Feed Posts */}
            {feedItems.map((feedItem) => (
              <div key={feedItem.post.id} className="bg-white rounded-xl shadow p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                    {feedItem.post.author.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{feedItem.post.author.username}</span>
                      <span className="text-gray-500 text-sm">
                        {format(new Date(feedItem.post.createdAt), 'MMM dd, yyyy • HH:mm')}
                      </span>
                      {feedItem.reason && (
                        <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full">
                          {feedItem.reason}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-gray-800">{feedItem.post.content}</p>
                    
                    {feedItem.post.media && feedItem.post.media.length > 0 && (
                      <div className="mt-3">
                        {feedItem.post.media.map((media, idx) => (
                          <img key={idx} src={media.url} alt="Post media" className="rounded-lg max-h-96 w-full object-cover" />
                        ))}
                      </div>
                    )}

                    {feedItem.post.hashtags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {feedItem.post.hashtags.map((tag) => (
                          <span key={tag} className="text-purple-600 text-sm hover:underline cursor-pointer">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {feedItem.post.mentions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {feedItem.post.mentions.map((mention) => (
                          <span key={mention.id} className="text-blue-600 text-sm hover:underline cursor-pointer">
                            @{mention.username}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-6 mt-4 pt-4 border-t">
                      <button
                        onClick={() => handleLike(feedItem.post.id, feedItem.post.isLiked)}
                        className={`flex items-center gap-2 ${feedItem.post.isLiked ? 'text-red-500' : 'text-gray-600'} hover:text-red-500 transition`}
                      >
                        <Heart className={`w-5 h-5 ${feedItem.post.isLiked ? 'fill-current' : ''}`} />
                        {feedItem.post.likeCount}
                      </button>
                      <button className="flex items-center gap-2 text-gray-600 hover:text-blue-500 transition">
                        <MessageCircle className="w-5 h-5" />
                        {feedItem.post.commentCount}
                      </button>
                      <button className="flex items-center gap-2 text-gray-600 hover:text-green-500 transition">
                        <Share2 className="w-5 h-5" />
                      </button>
                      <button className="flex items-center gap-2 text-gray-600 hover:text-purple-500 transition">
                        <Repeat className="w-5 h-5" />
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setShowReactionPicker(showReactionPicker === feedItem.post.id ? null : feedItem.post.id)}
                          className="p-1 hover:bg-gray-100 rounded transition"
                        >
                          <Smile className="w-5 h-5 text-gray-600" />
                        </button>
                        {showReactionPicker === feedItem.post.id && (
                          <div className="absolute top-8 left-0 bg-white shadow-lg rounded-lg p-2 flex gap-1 z-10">
                            {emojis.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(feedItem.post.id, emoji)}
                                className="p-2 hover:bg-gray-100 rounded text-xl"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Comment Input */}
                    <div className="mt-4 flex gap-2">
                      <input
                        type="text"
                        value={commentInput[feedItem.post.id] || ''}
                        onChange={(e) => setCommentInput({ ...commentInput, [feedItem.post.id]: e.target.value })}
                        placeholder="Write a comment..."
                        className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        onClick={() => handleComment(feedItem.post.id)}
                        className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right Sidebar */}
          <aside className="space-y-4">
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-semibold mb-3">Suggested Users</h3>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">User {i}</p>
                      <p className="text-xs text-gray-500">@user{i}</p>
                    </div>
                    <button className="text-purple-600 text-sm font-medium hover:text-purple-800">
                      Follow
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-semibold mb-3">Quick Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Posts</span>
                  <span className="font-medium">{feedItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Engagement Rate</span>
                  <span className="font-medium text-green-600">+12.5%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Users</span>
                  <span className="font-medium">1,234</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
