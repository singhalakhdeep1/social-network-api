/**
 * GRAPHQL SCHEMA DEFINITION
 * 
 * CURRICULUM COVERAGE:
 * #551-560: GraphQL Type System - Types, Queries, Mutations
 * #561-570: GraphQL Subscriptions for Real-time Updates
 * #571-575: Input Types and Custom Scalars
 */

import { gql } from 'apollo-server-express';

const typeDefs = gql`
  scalar Upload

  # User Type
  type User {
    id: ID!
    username: String!
    email: String!
    bio: String
    avatar: String
    followers: [User!]!
    following: [User!]!
    followerCount: Int!
    followingCount: Int!
    posts: [Post!]!
    createdAt: String!
  }

  # Media Type
  type Media {
    url: String!
    type: String!
    thumbnail: String
  }

  # Post Type
  type Post {
    id: ID!
    content: String!
    author: User!
    media: [Media!]!
    hashtags: [String!]!
    mentions: [User!]!
    likes: [User!]!
    likeCount: Int!
    comments: [Comment!]!
    commentCount: Int!
    reactions: [Reaction!]!
    isLiked: Boolean!
    sharesCount: Int!
    isPinned: Boolean!
    isArchived: Boolean!
    moderationStatus: String
    createdAt: String!
    updatedAt: String!
  }

  # Comment Type
  type Comment {
    id: ID!
    content: String!
    author: User!
    post: Post!
    parent: Comment
    replies: [Comment!]!
    likes: [User!]!
    likeCount: Int!
    replyCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  # Reaction Type
  type Reaction {
    id: ID!
    emoji: String!
    user: User!
    post: Post!
    comment: Comment
    createdAt: String!
  }

  # Feed Item (for personalized feed)
  type FeedItem {
    post: Post!
    score: Float!
    reason: String!
  }

  # Paginated Response
  type PostConnection {
    posts: [Post!]!
    hasMore: Boolean!
    cursor: String
    total: Int!
  }

  # Notification Type
  type Notification {
    id: ID!
    recipient: User!
    sender: User
    type: String!
    post: Post
    comment: Comment
    message: String!
    read: Boolean!
    readAt: String
    createdAt: String!
  }

  # Analytics Event Type
  type AnalyticsEvent {
    id: ID!
    user: User!
    eventType: String!
    post: Post
    targetUser: User
    metadata: String!
    createdAt: String!
  }

  # User Analytics
  type UserAnalytics {
    userId: ID!
    totalPosts: Int!
    totalLikes: Int!
    totalComments: Int!
    totalFollowers: Int!
    totalFollowing: Int!
    engagementRate: Float!
    topPosts: [Post!]!
  }

  # Authentication Response
  type AuthPayload {
    token: String!
    refreshToken: String!
    user: User!
  }

  # #551-560: GraphQL Queries
  type Query {
    # User Queries
    me: User
    user(id: ID!): User
    users(search: String, limit: Int): [User!]!
    
    # Post Queries
    post(id: ID!): Post
    posts(cursor: String, limit: Int): PostConnection!
    userPosts(userId: ID!, limit: Int): [Post!]!
    
    # Feed Algorithm - Personalized based on engagement
    feed(cursor: String, limit: Int): [FeedItem!]!
    
    # Search
    searchPosts(query: String!, limit: Int): [Post!]!
    searchUsers(query: String!, limit: Int): [User!]!
    
    # Hashtag Queries
    postsByHashtag(hashtag: String!, limit: Int): [Post!]!
    trendingHashtags(limit: Int): [String!]!
    
    # Comment Queries
    comments(postId: ID!, limit: Int): [Comment!]!
    commentReplies(commentId: ID!, limit: Int): [Comment!]!
    
    # Notification Queries
    notifications(limit: Int, unreadOnly: Boolean): [Notification!]!
    unreadNotificationCount: Int!
    
    # Analytics Queries
    myAnalytics: UserAnalytics!
    userAnalytics(userId: ID!): UserAnalytics!
  }

  # #551-560: GraphQL Mutations
  type Mutation {
    # Authentication
    register(username: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    refreshToken(refreshToken: String!): AuthPayload!
    
    # User Actions
    updateProfile(bio: String, avatar: String): User!
    followUser(userId: ID!): User!
    unfollowUser(userId: ID!): User!
    
    # Post Actions
    createPost(content: String!, media: Upload): Post!
    updatePost(id: ID!, content: String!): Post!
    deletePost(id: ID!): Boolean!
    likePost(postId: ID!): Post!
    unlikePost(postId: ID!): Post!
    sharePost(postId: ID!): Post!
    pinPost(postId: ID!): Post!
    unpinPost(postId: ID!): Post!
    archivePost(postId: ID!): Post!
    unarchivePost(postId: ID!): Post!
    
    # Comment Actions
    addComment(postId: ID!, content: String!, parentId: ID): Comment!
    deleteComment(id: ID!): Boolean!
    likeComment(commentId: ID!): Comment!
    unlikeComment(commentId: ID!): Comment!
    
    # Reaction Actions
    addReaction(postId: ID!, emoji: String!, commentId: ID): Reaction!
    removeReaction(postId: ID!, commentId: ID): Boolean!
    
    # Notification Actions
    markNotificationAsRead(notificationId: ID!): Notification!
    markAllNotificationsAsRead: Boolean!
    
    # Analytics Actions
    trackEvent(eventType: String!, postId: ID, targetUserId: ID, metadata: String): AnalyticsEvent!
  }

  # #561-570: GraphQL Subscriptions for Real-time
  type Subscription {
    postCreated: Post!
    postLiked(postId: ID!): Post!
    commentAdded(postId: ID!): Comment!
    reactionAdded(postId: ID!): Reaction!
    notificationAdded(userId: ID!): Notification!
    feedUpdated(userId: ID!): FeedItem!
    
    # Direct Messaging Subscriptions
    messageSent(conversationId: ID!): Message!
    typingIndicator(conversationId: ID!): TypingIndicator!
    conversationUpdated(userId: ID!): Conversation!
    
    # Stories Subscriptions
    storyCreated(userId: ID!): Story!
    storyViewed(storyId: ID!): Story!
    storyReactionAdded(storyId: ID!): StoryReaction!
    
    # Event Subscriptions
    eventRSVP(eventId: ID!): Event!
  }

  # ==================== DIRECT MESSAGING TYPES ====================
  
  type Message {
    id: ID!
    conversation: Conversation!
    sender: User!
    content: String!
    media: [Media!]!
    replyTo: Message
    isRead: Boolean!
    readAt: String
    isEncrypted: Boolean!
    reactions: [MessageReaction!]!
    isDeleted: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type MessageReaction {
    emoji: String!
    user: User!
  }

  type Conversation {
    id: ID!
    participants: [User!]!
    isGroup: Boolean!
    groupName: String
    groupAvatar: String
    groupDescription: String
    createdBy: User!
    admins: [User!]!
    lastMessage: Message
    lastMessageAt: String
    typingUsers: [User!]!
    isArchived: Boolean!
    isMuted: Boolean!
    unreadCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  type TypingIndicator {
    userId: ID!
    conversationId: ID!
    isTyping: Boolean!
  }

  # ==================== STORIES TYPES ====================
  
  type Story {
    id: ID!
    author: User!
    media: [Media!]!
    content: String
    hashtags: [String!]!
    mentions: [User!]!
    expiresAt: String!
    viewers: [User!]!
    viewerCount: Int!
    reactions: [StoryReaction!]!
    replies: [StoryReply!]!
    isArchived: Boolean!
    highlight: StoryHighlight
    createdAt: String!
    updatedAt: String!
  }

  type StoryReaction {
    emoji: String!
    user: User!
  }

  type StoryReply {
    id: ID!
    story: Story!
    author: User!
    content: String!
    reactions: [StoryReaction!]!
    createdAt: String!
  }

  type StoryHighlight {
    id: ID!
    author: User!
    title: String!
    coverUrl: String!
    stories: [Story!]!
    createdAt: String!
    updatedAt: String!
  }

  # ==================== CONTENT MANAGEMENT TYPES ====================
  
  type ScheduledPost {
    id: ID!
    author: User!
    content: String!
    media: [Media!]!
    hashtags: [String!]!
    mentions: [User!]!
    scheduledFor: String!
    status: String!
    publishedAt: String
    errorMessage: String
    createdAt: String!
    updatedAt: String!
  }

  type DraftPost {
    id: ID!
    author: User!
    content: String!
    media: [Media!]!
    hashtags: [String!]!
    mentions: [User!]!
    createdAt: String!
    updatedAt: String!
  }

  type ContentCalendar {
    posts: [ScheduledPost!]!
    drafts: [DraftPost!]!
    totalScheduled: Int!
    totalDrafts: Int!
  }

  # ==================== SOCIAL FEATURES TYPES ====================
  
  type PollOption {
    id: ID!
    text: String!
    votes: [User!]!
    voteCount: Int!
  }

  type Poll {
    id: ID!
    post: Post!
    author: User!
    question: String!
    options: [PollOption!]!
    multipleChoice: Boolean!
    maxChoices: Int
    expiresAt: String
    isActive: Boolean!
    totalVotes: Int!
    createdAt: String!
    updatedAt: String!
  }

  type Event {
    id: ID!
    host: User!
    title: String!
    description: String!
    coverImage: String
    location: EventLocation!
    startDate: String!
    endDate: String!
    isOnline: Boolean!
    meetingUrl: String
    maxAttendees: Int
    attendees: [User!]!
    waitlist: [User!]!
    isPublic: Boolean!
    category: String!
    tags: [String!]!
    attendeeCount: Int!
    waitlistCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  type EventLocation {
    name: String!
    address: String!
    coordinates: LocationCoordinates
  }

  type LocationCoordinates {
    lat: Float!
    lng: Float!
  }

  type Group {
    id: ID!
    name: String!
    description: String!
    avatar: String
    coverImage: String
    creator: User!
    admins: [User!]!
    members: [User!]!
    moderators: [User!]!
    isPrivate: Boolean!
    category: String!
    tags: [String!]!
    rules: [String!]!
    postCount: Int!
    memberCount: Int!
    isMember: Boolean!
    isAdmin: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type Page {
    id: ID!
    name: String!
    handle: String!
    description: String!
    avatar: String
    coverImage: String!
    category: String!
    owner: User!
    admins: [User!]!
    followers: [User!]!
    isVerified: Boolean!
    website: String
    phone: String
    location: String
    postCount: Int!
    followerCount: Int!
    isFollowing: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  # ==================== MONETIZATION TYPES ====================
  
  type Tip {
    id: ID!
    sender: User!
    recipient: User!
    amount: Float!
    currency: String!
    message: String
    isAnonymous: Boolean!
    paymentStatus: String!
    createdAt: String!
  }

  type Subscription {
    id: ID!
    creator: User!
    subscriber: User!
    tier: String!
    price: Float!
    currency: String!
    benefits: [String!]!
    startDate: String!
    endDate: String!
    isActive: Boolean!
    autoRenew: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type SubscriptionTier {
    name: String!
    price: Float!
    benefits: [String!]!
  }

  type Ad {
    id: ID!
    advertiser: User!
    title: String!
    description: String!
    media: [Media!]!
    targetUrl: String!
    targetAudience: AdTargetAudience!
    budget: Float!
    spent: Float!
    impressions: Int!
    clicks: Int!
    ctr: Float!
    status: String!
    startDate: String!
    endDate: String!
    createdAt: String!
    updatedAt: String!
  }

  type AdTargetAudience {
    interests: [String!]!
    ageRange: AgeRange
    locations: [String!]!
  }

  type AgeRange {
    min: Int!
    max: Int!
  }

  type CreatorDashboard {
    totalEarnings: Float!
    totalTips: Float!
    totalSubscriptions: Float!
    subscriberCount: Int!
    activeAds: [Ad!]!
    recentTips: [Tip!]!
  }

  # ==================== INTEGRATIONS TYPES ====================
  
  type Webhook {
    id: ID!
    url: String!
    events: [String!]!
    secret: String!
    isActive: Boolean!
    lastTriggered: String
    triggerCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  type SavedSearch {
    id: ID!
    query: String!
    filters: SearchFilters!
    name: String
    createdAt: String!
    updatedAt: String!
  }

  type SearchFilters {
    dateRange: DateRange
    location: String
    mediaType: [String!]!
    hashtags: [String!]!
  }

  type DateRange {
    start: String!
    end: String!
  }

  type SearchHistory {
    id: ID!
    query: String!
    searchedAt: String!
  }

  type SocialShare {
    platform: String!
    url: String!
    shareCount: Int!
  }

  # ==================== EXTENDED QUERIES ====================
  
  extend type Query {
    # Direct Messaging Queries
    conversations(limit: Int): [Conversation!]!
    conversation(id: ID!): Conversation!
    messages(conversationId: ID!, cursor: String, limit: Int): [Message!]!
    searchMessages(query: String!, conversationId: ID): [Message!]!
    
    # Stories Queries
    myStories: [Story!]!
    userStories(userId: ID!): [Story!]!
    story(id: ID!): Story!
    storyFeed: [Story!]!
    userStoryHighlights(userId: ID!): [StoryHighlight!]!
    
    # Content Management Queries
    myScheduledPosts: [ScheduledPost!]!
    myDraftPosts: [DraftPost!]!
    contentCalendar: ContentCalendar!
    
    # Social Features Queries
    poll(id: ID!): Poll!
    event(id: ID!): Event!
    events(limit: Int, category: String): [Event!]!
    myEvents: [Event!]!
    group(id: ID!): Group!
    groups(limit: Int, category: String): [Group!]!
    myGroups: [Group!]!
    page(id: ID!): Page!
    pages(limit: Int, category: String): [Page!]!
    myPages: [Page!]!
    
    # Monetization Queries
    myTips: [Tip!]!
    receivedTips: [Tip!]!
    mySubscriptions: [Subscription!]!
    creatorSubscriptions(creatorId: ID!): [Subscription!]!
    myAds: [Ad!]!
    ad(id: ID!): Ad!
    subscriptionTiers: [SubscriptionTier!]!
    creatorDashboard: CreatorDashboard!
    
    # Integrations Queries
    myWebhooks: [Webhook!]!
    webhook(id: ID!): Webhook!
    savedSearches: [SavedSearch!]!
    searchHistory(limit: Int): [SearchHistory!]!
    
    # Advanced Search Queries
    advancedSearch(query: String!, filters: SearchFilters, limit: Int): [Post!]!
    autocompleteSuggestions(query: String!, limit: Int): [String!]!
  }

  # ==================== EXTENDED MUTATIONS ====================
  
  extend type Mutation {
    # Direct Messaging Mutations
    createConversation(participantIds: [ID!]!, isGroup: Boolean, groupName: String): Conversation!
    sendMessage(conversationId: ID!, content: String!, media: Upload, replyTo: ID): Message!
    markMessagesAsRead(conversationId: ID!): Boolean!
    deleteMessage(messageId: ID!): Boolean!
    addMessageReaction(messageId: ID!, emoji: String!): MessageReaction!
    setTypingIndicator(conversationId: ID!, isTyping: Boolean!): Boolean!
    archiveConversation(conversationId: ID!): Boolean!
    muteConversation(conversationId: ID!, until: String): Boolean!
    addGroupAdmin(conversationId: ID!, userId: ID!): Conversation!
    removeGroupAdmin(conversationId: ID!, userId: ID!): Conversation!
    addGroupMember(conversationId: ID!, userId: ID!): Conversation!
    removeGroupMember(conversationId: ID!, userId: ID!): Conversation!
    leaveGroup(conversationId: ID!): Boolean!
    
    # Stories Mutations
    createStory(media: Upload!, content: String): Story!
    viewStory(storyId: ID!): Story!
    addStoryReaction(storyId: ID!, emoji: String!): StoryReaction!
    addStoryReply(storyId: ID!, content: String!): StoryReply!
    deleteStory(storyId: ID!): Boolean!
    createStoryHighlight(title: String!, coverUrl: String!, storyIds: [ID!]!): StoryHighlight!
    deleteStoryHighlight(highlightId: ID!): Boolean!
    addToHighlight(highlightId: ID!, storyId: ID!): StoryHighlight!
    removeFromHighlight(highlightId: ID!, storyId: ID!): StoryHighlight!
    
    # Content Management Mutations
    createDraft(content: String!, media: Upload): DraftPost!
    updateDraft(id: ID!, content: String, media: Upload): DraftPost!
    deleteDraft(id: ID!): Boolean!
    schedulePost(content: String!, media: Upload, scheduledFor: String!): ScheduledPost!
    updateScheduledPost(id: ID!, scheduledFor: String!): ScheduledPost!
    deleteScheduledPost(id: ID!): Boolean!
    publishScheduledPost(id: ID!): Post!
    
    # Social Features Mutations
    createPoll(postId: ID!, question: String!, options: [String!]!, multipleChoice: Boolean, maxChoices: Int, expiresAt: String): Poll!
    votePoll(pollId: ID!, optionIds: [ID!]!): Poll!
    createEvent(title: String!, description: String!, location: EventLocationInput!, startDate: String!, endDate: String!, isOnline: Boolean, meetingUrl: String, maxAttendees: Int, isPublic: Boolean, category: String, tags: [String!], coverImage: Upload): Event!
    rsvpEvent(eventId: ID!, attending: Boolean!): Event!
    cancelEventRSVP(eventId: ID!): Event!
    createGroup(name: String!, description: String!, isPrivate: Boolean, category: String, tags: [String!], avatar: Upload, coverImage: Upload): Group!
    updateGroup(groupId: ID!, name: String, description: String, avatar: Upload, coverImage: Upload): Group!
    joinGroup(groupId: ID!): Group!
    leaveGroup(groupId: ID!): Group!
    addGroupMember(groupId: ID!, userId: ID!): Group!
    removeGroupMember(groupId: ID!, userId: ID!): Group!
    addGroupAdmin(groupId: ID!, userId: ID!): Group!
    removeGroupAdmin(groupId: ID!, userId: ID!): Group!
    createPage(name: String!, handle: String!, description: String!, category: String, avatar: Upload, coverImage: Upload, website: String, phone: String, location: String): Page!
    updatePage(pageId: ID!, name: String, description: String, avatar: Upload, coverImage: Upload, website: String, phone: String, location: String): Page!
    followPage(pageId: ID!): Page!
    unfollowPage(pageId: ID!): Page!
    
    # Monetization Mutations
    sendTip(recipientId: ID!, amount: Float!, message: String, isAnonymous: Boolean): Tip!
    createSubscription(creatorId: ID!, tier: String!): Subscription!
    cancelSubscription(subscriptionId: ID!): Boolean!
    updateSubscription(subscriptionId: ID!, tier: String!): Subscription!
    createAd(title: String!, description: String!, media: Upload!, targetUrl: String!, targetAudience: AdTargetAudienceInput!, budget: Float!, startDate: String!, endDate: String!): Ad!
    updateAd(adId: ID!, title: String, description: String, status: String): Ad!
    pauseAd(adId: ID!): Ad!
    resumeAd(adId: ID!): Ad!
    deleteAd(adId: ID!): Boolean!
    
    # Integrations Mutations
    createWebhook(url: String!, events: [String!]!): Webhook!
    updateWebhook(webhookId: ID!, url: String, events: [String!], isActive: Boolean): Webhook!
    deleteWebhook(webhookId: ID!): Boolean!
    createSavedSearch(query: String!, filters: SearchFiltersInput, name: String): SavedSearch!
    deleteSavedSearch(searchId: ID!): Boolean!
    clearSearchHistory: Boolean!
    sharePost(postId: ID!, platform: String!): SocialShare!
  }

  # ==================== INPUT TYPES ====================
  
  input EventLocationInput {
    name: String!
    address: String!
    coordinates: LocationCoordinatesInput
  }

  input LocationCoordinatesInput {
    lat: Float!
    lng: Float!
  }

  input AdTargetAudienceInput {
    interests: [String!]!
    ageRange: AgeRangeInput
    locations: [String!]!
  }

  input AgeRangeInput {
    min: Int!
    max: Int!
  }

  input SearchFiltersInput {
    dateRange: DateRangeInput
    location: String
    mediaType: [String!]!
    hashtags: [String!]!
  }

  input DateRangeInput {
    start: String!
    end: String!
  }
`;

export default typeDefs;
