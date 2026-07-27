import { gql } from '@apollo/client';

export const GET_ME = gql`
  query GetMe {
    me {
      id
      username
      email
      bio
      avatar
      followerCount
      followingCount
    }
  }
`;

export const GET_FEED = gql`
  query GetFeed($cursor: String, $limit: Int) {
    feed(cursor: $cursor, limit: $limit) {
      post {
        id
        content
        author {
          id
          username
          avatar
        }
        media {
          url
          type
        }
        hashtags
        mentions {
          id
          username
        }
        likeCount
        commentCount
        isLiked
        createdAt
      }
      score
      reason
    }
  }
`;

export const GET_POSTS = gql`
  query GetPosts($cursor: String, $limit: Int) {
    posts(cursor: $cursor, limit: $limit) {
      posts {
        id
        content
        author {
          id
          username
          avatar
        }
        media {
          url
          type
        }
        hashtags
        likeCount
        commentCount
        isLiked
        createdAt
      }
      hasMore
      cursor
      total
    }
  }
`;

export const GET_POST = gql`
  query GetPost($id: ID!) {
    post(id: $id) {
      id
      content
      author {
        id
        username
        avatar
        bio
      }
      media {
        url
        type
      }
      hashtags
      mentions {
        id
        username
      }
      likes {
        id
        username
      }
      likeCount
      commentCount
      createdAt
      updatedAt
    }
  }
`;

export const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      username
      email
      bio
      avatar
      followerCount
      followingCount
      posts {
        id
        content
        likeCount
        commentCount
        createdAt
      }
    }
  }
`;

export const GET_USERS = gql`
  query GetUsers($search: String, $limit: Int) {
    users(search: $search, limit: $limit) {
      id
      username
      avatar
      followerCount
      followingCount
    }
  }
`;

export const GET_COMMENTS = gql`
  query GetComments($postId: ID!, $limit: Int) {
    comments(postId: $postId, limit: $limit) {
      id
      content
      author {
        id
        username
        avatar
      }
      likeCount
      replyCount
      createdAt
    }
  }
`;

export const GET_NOTIFICATIONS = gql`
  query GetNotifications($limit: Int, $unreadOnly: Boolean) {
    notifications(limit: $limit, unreadOnly: $unreadOnly) {
      id
      type
      message
      read
      readAt
      createdAt
      sender {
        id
        username
        avatar
      }
      post {
        id
        content
      }
    }
  }
`;

export const GET_MY_ANALYTICS = gql`
  query GetMyAnalytics {
    myAnalytics {
      userId
      totalPosts
      totalLikes
      totalComments
      totalFollowers
      totalFollowing
      engagementRate
      topPosts {
        id
        content
        likeCount
        commentCount
      }
    }
  }
`;

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      refreshToken
      user {
        id
        username
        email
        avatar
      }
    }
  }
`;

export const REGISTER = gql`
  mutation Register($username: String!, $email: String!, $password: String!) {
    register(username: $username, email: $email, password: $password) {
      token
      refreshToken
      user {
        id
        username
        email
        avatar
      }
    }
  }
`;

export const CREATE_POST = gql`
  mutation CreatePost($content: String!, $media: Upload) {
    createPost(content: $content, media: $media) {
      id
      content
      author {
        id
        username
        avatar
      }
      media {
        url
        type
      }
      hashtags
      likeCount
      commentCount
      createdAt
    }
  }
`;

export const LIKE_POST = gql`
  mutation LikePost($postId: ID!) {
    likePost(postId: $postId) {
      id
      likeCount
      isLiked
    }
  }
`;

export const UNLIKE_POST = gql`
  mutation UnlikePost($postId: ID!) {
    unlikePost(postId: $postId) {
      id
      likeCount
      isLiked
    }
  }
`;

export const ADD_COMMENT = gql`
  mutation AddComment($postId: ID!, $content: String!, $parentId: ID) {
    addComment(postId: $postId, content: $content, parentId: $parentId) {
      id
      content
      author {
        id
        username
        avatar
      }
      likeCount
      createdAt
    }
  }
`;

export const DELETE_COMMENT = gql`
  mutation DeleteComment($id: ID!) {
    deleteComment(id: $id)
  }
`;

export const FOLLOW_USER = gql`
  mutation FollowUser($userId: ID!) {
    followUser(userId: $userId) {
      id
      username
      followerCount
      followingCount
    }
  }
`;

export const UNFOLLOW_USER = gql`
  mutation UnfollowUser($userId: ID!) {
    unfollowUser(userId: $userId) {
      id
      username
      followerCount
      followingCount
    }
  }
`;

export const ADD_REACTION = gql`
  mutation AddReaction($postId: ID!, $emoji: String!, $commentId: ID) {
    addReaction(postId: $postId, emoji: $emoji, commentId: $commentId) {
      id
      emoji
      user {
        id
        username
      }
    }
  }
`;

export const REMOVE_REACTION = gql`
  mutation RemoveReaction($postId: ID!, $commentId: ID) {
    removeReaction(postId: $postId, commentId: $commentId)
  }
`;

export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($notificationId: ID!) {
    markNotificationAsRead(notificationId: $notificationId) {
      id
      read
      readAt
    }
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsAsRead
  }
`;

export const POST_CREATED = gql`
  subscription PostCreated {
    postCreated {
      id
      content
      author {
        id
        username
        avatar
      }
      media {
        url
        type
      }
      likeCount
      commentCount
      createdAt
    }
  }
`;

export const POST_LIKED = gql`
  subscription PostLiked($postId: ID!) {
    postLiked(postId: $postId) {
      id
      likeCount
      isLiked
    }
  }
`;

export const COMMENT_ADDED = gql`
  subscription CommentAdded($postId: ID!) {
    commentAdded(postId: $postId) {
      id
      content
      author {
        id
        username
        avatar
      }
      likeCount
      createdAt
    }
  }
`;

export const REACTION_ADDED = gql`
  subscription ReactionAdded($postId: ID!) {
    reactionAdded(postId: $postId) {
      id
      emoji
      user {
        id
        username
      }
    }
  }
`;

export const NOTIFICATION_ADDED = gql`
  subscription NotificationAdded($userId: ID!) {
    notificationAdded(userId: $userId) {
      id
      type
      message
      read
      createdAt
      sender {
        id
        username
        avatar
      }
    }
  }
`;
