'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Message from '@/components/Message';
import LeftSidebar from '@/components/LeftSidebar';
import CreatePostForm from '@/components/CreatePostForm';
import PostFeed from '@/components/PostFeed';
import RightSidebar from '@/components/RightSidebar';
import Features from '@/components/Features';

export default function SocialMediaApp() {
    const [posts, setPosts] = useState([]);
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState({});
    const [message, setMessage] = useState(null);
    const [newPostContent, setNewPostContent] = useState('');
    const [activeTab, setActiveTab] = useState('feed');

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    const showMessage = (msg, type = 'success') => {
        setMessage({ text: msg, type });
        setTimeout(() => setMessage(null), 5000);
    };

    const fetchPosts = async () => {
        setLoading((prev) => ({ ...prev, posts: true }));
        try {
            const res = await fetch(`${API_URL}/posts`);
            const data = await res.json();
            setPosts(data.data || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading((prev) => ({ ...prev, posts: false }));
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_URL}/users`);
            const data = await res.json();
            setUsers(data.data || []);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const createPost = async (e) => {
        e.preventDefault();
        if (!newPostContent.trim()) return;

        setLoading((prev) => ({ ...prev, createPost: true }));
        try {
            const res = await fetch(`${API_URL}/posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newPostContent }),
            });
            const data = await res.json();
            if (data.success) {
                showMessage('Post created successfully!');
                setNewPostContent('');
                fetchPosts();
            }
        } catch (error) {
            showMessage('Failed to create post', 'error');
        } finally {
            setLoading((prev) => ({ ...prev, createPost: false }));
        }
    };

    const likePost = async (postId) => {
        try {
            const res = await fetch(`${API_URL}/posts/${postId}/like`, {
                method: 'POST',
            });
            const data = await res.json();
            if (data.success) {
                fetchPosts();
            }
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const addComment = async (postId, content) => {
        if (!content.trim()) return;

        try {
            const res = await fetch(`${API_URL}/posts/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            const data = await res.json();
            if (data.success) {
                fetchPosts();
            }
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const followUser = async (userId) => {
        try {
            const res = await fetch(`${API_URL}/users/${userId}/follow`, {
                method: 'POST',
            });
            const data = await res.json();
            if (data.success) {
                showMessage('Followed successfully');
                fetchUsers();
            }
        } catch (error) {
            console.error('Error:', error);
        }
    };

    useEffect(() => {
        fetchPosts();
        fetchUsers();
        setCurrentUser({ _id: '1', name: 'Demo User', username: 'demo', avatar: 'D' });
    }, []);

    return (
        <div className="max-w-7xl mx-auto px-5 py-10">
            <header className="mb-10 text-center">
                <h1 className="text-5xl font-bold text-white mb-2">
                    🌐 Social Network
                </h1>
                <p className="text-white/80 text-lg">
                    GraphQL-Powered Social Platform
                </p>
            </header>

            <Message message={message} />

            <div className="grid grid-cols-[300px_1fr_300px] gap-6">
                <LeftSidebar 
                    currentUser={currentUser}
                    users={users}
                    onFollow={followUser}
                />
                <div className="flex-1">
                    <CreatePostForm 
                        content={newPostContent}
                        setContent={setNewPostContent}
                        onSubmit={createPost}
                        loading={loading.createPost}
                    />
                    <PostFeed 
                        posts={posts}
                        onLike={likePost}
                    />
                </div>
                <RightSidebar />
            </div>

            <Features />
        </div>
    );
}
