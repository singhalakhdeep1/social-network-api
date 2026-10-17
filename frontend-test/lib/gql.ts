import { gql } from '@apollo/client';

/* ---------------- fragments ---------------- */

export const USER = gql`
  fragment UserBasic on User {
    id
    username
    displayName
    avatar
    isVerified
  }
`;

export const POST = gql`
  ${USER}
  fragment PostFields on Post {
    id
    content
    createdAt
    hashtags
    likeCount
    commentCount
    sharesCount
    reactionCount
    isLiked
    myReaction
    isPinned
    isArchived
    reactions {
      emoji
      count
    }
    media {
      url
      type
    }
    author {
      ...UserBasic
    }
    mentions {
      id
      username
    }
    group {
      id
      name
    }
    page {
      id
      name
      handle
    }
    sharedFrom {
      id
      content
      createdAt
      media {
        url
        type
      }
      author {
        ...UserBasic
      }
    }
    poll {
      id
      question
      multipleChoice
      maxChoices
      totalVotes
      hasVoted
      myVotes
      isActive
      options {
        id
        text
        voteCount
      }
    }
  }
`;

export const COMMENT = gql`
  ${USER}
  fragment CommentFields on Comment {
    id
    content
    createdAt
    likeCount
    replyCount
    isLiked
    author {
      ...UserBasic
    }
  }
`;

/* ---------------- auth ---------------- */

const AUTH_FIELDS = `accessToken refreshToken user { id username role }`;
export const LOGIN = gql`mutation Login($email: String!, $password: String!, $code: String) { login(email: $email, password: $password, twoFactorCode: $code) { ${AUTH_FIELDS} } }`;
export const REGISTER = gql`mutation Register($username: String!, $email: String!, $password: String!, $displayName: String) { register(username: $username, email: $email, password: $password, displayName: $displayName) { ${AUTH_FIELDS} } }`;
export const LOGOUT = gql`mutation Logout($refreshToken: String) { logout(refreshToken: $refreshToken) }`;
export const VERIFY_EMAIL = gql`mutation VerifyEmail($token: String!) { verifyEmail(token: $token) }`;
export const RESEND_VERIFICATION = gql`mutation { resendVerificationEmail }`;
export const FORGOT_PASSWORD = gql`mutation Forgot($email: String!) { forgotPassword(email: $email) }`;
export const RESET_PASSWORD = gql`mutation Reset($token: String!, $password: String!) { resetPassword(token: $token, password: $password) }`;
export const CHANGE_PASSWORD = gql`mutation ChangePassword($current: String!, $next: String!) { changePassword(currentPassword: $current, newPassword: $next) }`;
export const SETUP_2FA = gql`mutation { setupTwoFactor { secret otpauthUrl } }`;
export const ENABLE_2FA = gql`mutation Enable2fa($code: String!) { enableTwoFactor(code: $code) }`;
export const DISABLE_2FA = gql`mutation Disable2fa($password: String!, $code: String) { disableTwoFactor(password: $password, code: $code) }`;

export const ME = gql`
  query Me {
    me {
      id
      username
      displayName
      email
      bio
      avatar
      website
      location
      interests
      role
      isPrivate
      isVerified
      emailVerified
      twoFactorEnabled
      followerCount
      followingCount
      postCount
      notificationPreferences {
        email
        push
        mentions
        follows
        likes
        comments
        messages
      }
    }
    unreadNotificationCount
  }
`;

/* ---------------- users ---------------- */

export const PROFILE = gql`
  ${USER}
  ${POST}
  query Profile($username: String!) {
    userByUsername(username: $username) {
      ...UserBasic
      bio
      website
      location
      isPrivate
      followerCount
      followingCount
      postCount
      isFollowing
      isFollowedBy
      isMe
      createdAt
      posts(limit: 20) {
        nodes {
          ...PostFields
        }
      }
      highlights {
        id
        title
        coverUrl
      }
    }
  }
`;
export const USER_CONNECTIONS = gql`
  ${USER}
  query Connections($userId: ID!) {
    mutualConnections(userId: $userId, limit: 5) {
      ...UserBasic
    }
    connectionPath(userId: $userId) {
      distance
      users {
        id
        username
      }
    }
  }
`;
export const FOLLOWERS = gql`
  ${USER}
  query Followers($id: ID!) {
    user(id: $id) {
      id
      followers(limit: 50) {
        nodes {
          ...UserBasic
        }
      }
      following(limit: 50) {
        nodes {
          ...UserBasic
        }
      }
    }
  }
`;
export const FOLLOW = gql`mutation Follow($userId: ID!) { followUser(userId: $userId) { id isFollowing followerCount } }`;
export const UNFOLLOW = gql`mutation Unfollow($userId: ID!) { unfollowUser(userId: $userId) { id isFollowing followerCount } }`;
export const SUGGESTED = gql`
  ${USER}
  query Suggested {
    suggestedUsers(limit: 5) {
      mutualCount
      user {
        ...UserBasic
      }
    }
  }
`;
export const UPDATE_PROFILE = gql`mutation UpdateProfile($input: ProfileInput!) { updateProfile(input: $input) { id displayName bio website location interests isPrivate } }`;
export const UPLOAD_AVATAR = gql`mutation UploadAvatar($file: Upload!) { uploadAvatar(file: $file) { id avatar } }`;
export const UPDATE_NOTIFICATION_PREFS = gql`mutation Prefs($input: NotificationPreferencesInput!) { updateNotificationPreferences(input: $input) { id } }`;
export const SET_VERIFIED = gql`mutation SetVerified($userId: ID!, $verified: Boolean!) { setUserVerified(userId: $userId, verified: $verified) { id isVerified } }`;

/* ---------------- posts ---------------- */

export const FEED = gql`
  ${POST}
  query Feed($cursor: String, $refresh: Boolean) {
    feed(limit: 15, cursor: $cursor, refresh: $refresh) {
      nextCursor
      hasMore
      items {
        score
        reason
        post {
          ...PostFields
        }
      }
    }
  }
`;
export const EXPLORE = gql`
  ${POST}
  query Explore($cursor: String) {
    posts(limit: 15, cursor: $cursor) {
      nextCursor
      hasMore
      nodes {
        ...PostFields
      }
    }
    trendingHashtags(limit: 10) {
      tag
      count
    }
  }
`;
export const TRENDING_POSTS = gql`
  ${POST}
  query TrendingPosts {
    trendingPosts(limit: 10) {
      ...PostFields
    }
  }
`;
export const HASHTAG = gql`
  ${POST}
  query Hashtag($tag: String!, $cursor: String) {
    postsByHashtag(hashtag: $tag, limit: 15, cursor: $cursor) {
      nextCursor
      hasMore
      nodes {
        ...PostFields
      }
    }
  }
`;
export const POST_DETAIL = gql`
  ${POST}
  query PostDetail($id: ID!) {
    post(id: $id) {
      ...PostFields
    }
  }
`;
/** Comments load separately (and replies on demand) to keep each query under the server's complexity budget. */
export const COMMENTS = gql`
  ${COMMENT}
  query Comments($postId: ID!, $cursor: String) {
    comments(postId: $postId, limit: 30, cursor: $cursor) {
      nextCursor
      hasMore
      nodes {
        ...CommentFields
      }
    }
  }
`;
export const REPLIES = gql`
  ${COMMENT}
  query Replies($commentId: ID!) {
    commentReplies(commentId: $commentId, limit: 30) {
      nodes {
        ...CommentFields
      }
    }
  }
`;
export const CREATE_POST = gql`
  ${POST}
  mutation CreatePost($content: String, $media: [Upload!], $mediaUrls: [String!], $groupId: ID, $pageId: ID) {
    createPost(content: $content, media: $media, mediaUrls: $mediaUrls, groupId: $groupId, pageId: $pageId) {
      ...PostFields
    }
  }
`;
export const CREATE_POLL = gql`mutation CreatePoll($postId: ID!, $question: String!, $options: [String!]!, $multipleChoice: Boolean) { createPoll(postId: $postId, question: $question, options: $options, multipleChoice: $multipleChoice) { id } }`;
export const VOTE_POLL = gql`mutation Vote($pollId: ID!, $optionIds: [ID!]!) { votePoll(pollId: $pollId, optionIds: $optionIds) { id totalVotes hasVoted myVotes options { id voteCount } } }`;
export const UPDATE_POST = gql`mutation UpdatePost($id: ID!, $content: String!) { updatePost(id: $id, content: $content) { id content hashtags } }`;
export const DELETE_POST = gql`mutation DeletePost($id: ID!) { deletePost(id: $id) }`;
export const LIKE_POST = gql`mutation Like($postId: ID!) { likePost(postId: $postId) { id likeCount isLiked } }`;
export const UNLIKE_POST = gql`mutation Unlike($postId: ID!) { unlikePost(postId: $postId) { id likeCount isLiked } }`;
export const REACT = gql`mutation React($postId: ID!, $emoji: String!) { addReaction(postId: $postId, emoji: $emoji) { id } }`;
export const UNREACT = gql`mutation Unreact($postId: ID!) { removeReaction(postId: $postId) }`;
export const SHARE_POST = gql`mutation Share($postId: ID!, $comment: String) { sharePost(postId: $postId, comment: $comment) { id } }`;
export const SHARE_PLATFORM = gql`mutation SharePlatform($postId: ID!, $platform: String!) { shareToPlatform(postId: $postId, platform: $platform) { url shareCount } }`;
export const PIN = gql`mutation Pin($postId: ID!) { pinPost(postId: $postId) { id isPinned } }`;
export const UNPIN = gql`mutation Unpin($postId: ID!) { unpinPost(postId: $postId) { id isPinned } }`;
export const ARCHIVE = gql`mutation Archive($postId: ID!) { archivePost(postId: $postId) { id isArchived } }`;
export const UNARCHIVE = gql`mutation Unarchive($postId: ID!) { unarchivePost(postId: $postId) { id isArchived } }`;
export const ARCHIVED = gql`
  query Archived {
    archivedPosts(limit: 50) {
      nodes {
        id
        content
        createdAt
      }
    }
  }
`;
export const ADD_COMMENT = gql`
  ${COMMENT}
  mutation AddComment($postId: ID!, $content: String!, $parentId: ID) {
    addComment(postId: $postId, content: $content, parentId: $parentId) {
      ...CommentFields
    }
  }
`;
export const DELETE_COMMENT = gql`mutation DeleteComment($id: ID!) { deleteComment(id: $id) }`;
export const LIKE_COMMENT = gql`mutation LikeComment($id: ID!) { likeComment(commentId: $id) { id likeCount isLiked } }`;
export const UNLIKE_COMMENT = gql`mutation UnlikeComment($id: ID!) { unlikeComment(commentId: $id) { id likeCount isLiked } }`;

/* ---------------- drafts & scheduling ---------------- */

export const CONTENT_CALENDAR = gql`
  query Calendar {
    contentCalendar {
      totalScheduled
      totalDrafts
      posts {
        id
        content
        scheduledFor
        status
      }
      drafts {
        id
        content
        updatedAt
      }
    }
    myScheduledPosts(includeProcessed: true) {
      id
      content
      scheduledFor
      status
      publishedAt
      errorMessage
    }
  }
`;
export const CREATE_DRAFT = gql`mutation CreateDraft($content: String) { createDraft(content: $content) { id } }`;
export const UPDATE_DRAFT = gql`mutation UpdateDraft($id: ID!, $content: String) { updateDraft(id: $id, content: $content) { id content } }`;
export const DELETE_DRAFT = gql`mutation DeleteDraft($id: ID!) { deleteDraft(id: $id) }`;
export const PUBLISH_DRAFT = gql`mutation PublishDraft($id: ID!) { publishDraft(id: $id) { id } }`;
export const SCHEDULE_POST = gql`mutation Schedule($content: String, $scheduledFor: String!) { schedulePost(content: $content, scheduledFor: $scheduledFor) { id } }`;
export const DELETE_SCHEDULED = gql`mutation DeleteScheduled($id: ID!) { deleteScheduledPost(id: $id) }`;
export const PUBLISH_SCHEDULED = gql`mutation PublishScheduled($id: ID!) { publishScheduledPost(id: $id) { id } }`;

/* ---------------- notifications ---------------- */

export const NOTIFICATIONS = gql`
  ${USER}
  query Notifications($cursor: String) {
    notifications(limit: 30, cursor: $cursor) {
      nextCursor
      hasMore
      nodes {
        id
        type
        message
        read
        createdAt
        sender {
          ...UserBasic
        }
        post {
          id
        }
      }
    }
    unreadNotificationCount
  }
`;
export const MARK_READ = gql`mutation MarkRead($id: ID!) { markNotificationAsRead(notificationId: $id) { id read } }`;
export const MARK_ALL_READ = gql`mutation { markAllNotificationsAsRead }`;
export const NOTIFICATION_ADDED = gql`subscription { notificationAdded { id type message createdAt } }`;
export const FEED_UPDATED = gql`subscription { feedUpdated { id } }`;

/* ---------------- search ---------------- */

export const SEARCH = gql`
  ${USER}
  ${POST}
  query Search($q: String!) {
    search(query: $q, limit: 20) {
      users {
        ...UserBasic
        bio
        followerCount
      }
      posts {
        ...PostFields
      }
      hashtags {
        tag
        count
      }
    }
  }
`;
export const AUTOCOMPLETE = gql`query Autocomplete($q: String!) { autocompleteSuggestions(query: $q, limit: 6) }`;
export const SEARCH_HISTORY = gql`
  query SearchHistory {
    searchHistory(limit: 10) {
      id
      query
    }
    savedSearches {
      id
      query
      name
    }
  }
`;
export const SAVE_SEARCH = gql`mutation SaveSearch($query: String!, $name: String) { createSavedSearch(query: $query, name: $name) { id } }`;
export const DELETE_SAVED_SEARCH = gql`mutation DeleteSaved($id: ID!) { deleteSavedSearch(searchId: $id) }`;
export const CLEAR_HISTORY = gql`mutation { clearSearchHistory }`;

/* ---------------- messaging ---------------- */

export const CONVERSATIONS = gql`
  ${USER}
  query Conversations {
    conversations(limit: 50) {
      id
      isGroup
      groupName
      unreadCount
      lastMessageAt
      participants {
        ...UserBasic
      }
      lastMessage {
        id
        content
        sender {
          id
        }
      }
    }
  }
`;
export const MESSAGES = gql`
  ${USER}
  query Messages($conversationId: ID!) {
    conversation(id: $conversationId) {
      id
      isGroup
      groupName
      participants {
        ...UserBasic
      }
      typingUsers {
        id
        username
      }
    }
    messages(conversationId: $conversationId, limit: 50) {
      nodes {
        id
        content
        createdAt
        isDeleted
        sender {
          ...UserBasic
        }
        reactions {
          emoji
          user {
            id
          }
        }
        media {
          url
          type
        }
      }
    }
  }
`;
export const CREATE_CONVERSATION = gql`mutation CreateConversation($ids: [ID!]!, $isGroup: Boolean, $groupName: String) { createConversation(participantIds: $ids, isGroup: $isGroup, groupName: $groupName) { id } }`;
export const SEND_MESSAGE = gql`mutation SendMessage($conversationId: ID!, $content: String) { sendMessage(conversationId: $conversationId, content: $content) { id } }`;
export const MARK_CONVERSATION_READ = gql`mutation MarkConvRead($id: ID!) { markConversationRead(conversationId: $id) }`;
export const SET_TYPING = gql`mutation Typing($id: ID!, $isTyping: Boolean!) { setTypingIndicator(conversationId: $id, isTyping: $isTyping) }`;
export const REACT_MESSAGE = gql`mutation ReactMessage($id: ID!, $emoji: String!) { reactToMessage(messageId: $id, emoji: $emoji) { id } }`;
export const DELETE_MESSAGE = gql`mutation DeleteMessage($id: ID!) { deleteMessage(messageId: $id) }`;
export const MESSAGE_SENT = gql`subscription MessageSent($conversationId: ID!) { messageSent(conversationId: $conversationId) { id } }`;
export const TYPING = gql`subscription TypingSub($conversationId: ID!) { typingIndicator(conversationId: $conversationId) { isTyping userId } }`;

/* ---------------- stories ---------------- */

export const STORY_TRAY = gql`
  ${USER}
  query StoryTray {
    storyTray {
      hasUnseen
      author {
        ...UserBasic
      }
      stories {
        id
        content
        createdAt
        expiresAt
        hasViewed
        viewerCount
        media {
          url
          type
        }
      }
    }
    myStories {
      id
      viewerCount
      content
    }
  }
`;
export const CREATE_STORY = gql`mutation CreateStory($media: [Upload!], $mediaUrls: [String!], $content: String) { createStory(media: $media, mediaUrls: $mediaUrls, content: $content) { id } }`;
export const VIEW_STORY = gql`mutation ViewStory($id: ID!) { viewStory(storyId: $id) { id hasViewed viewerCount } }`;
export const REPLY_STORY = gql`mutation ReplyStory($id: ID!, $content: String!) { addStoryReply(storyId: $id, content: $content) { id } }`;
export const REACT_STORY = gql`mutation ReactStory($id: ID!, $emoji: String!) { addStoryReaction(storyId: $id, emoji: $emoji) { emoji } }`;

/* ---------------- communities ---------------- */

export const GROUPS = gql`
  query Groups($search: String) {
    groups(search: $search, limit: 30) {
      nodes {
        id
        name
        description
        isPrivate
        category
        memberCount
        isMember
        hasRequestedToJoin
      }
    }
    myGroups {
      id
      name
    }
  }
`;
export const GROUP = gql`
  ${USER}
  ${POST}
  query Group($id: ID!) {
    group(id: $id) {
      id
      name
      description
      isPrivate
      category
      rules
      memberCount
      isMember
      isAdmin
      hasRequestedToJoin
      pendingMembers {
        ...UserBasic
      }
      members(limit: 12) {
        ...UserBasic
      }
    }
    groupPosts(groupId: $id, limit: 15) {
      nodes {
        ...PostFields
      }
    }
  }
`;
export const CREATE_GROUP = gql`mutation CreateGroup($name: String!, $description: String!, $isPrivate: Boolean, $category: String) { createGroup(name: $name, description: $description, isPrivate: $isPrivate, category: $category) { id } }`;
export const JOIN_GROUP = gql`mutation Join($id: ID!) { joinGroup(groupId: $id) { id isMember hasRequestedToJoin memberCount } }`;
export const LEAVE_GROUP = gql`mutation Leave($id: ID!) { leaveGroup(groupId: $id) { id isMember memberCount } }`;
export const APPROVE_MEMBER = gql`mutation Approve($id: ID!, $userId: ID!, $approve: Boolean!) { approveGroupMember(groupId: $id, userId: $userId, approve: $approve) { id memberCount } }`;

export const EVENTS = gql`
  query Events {
    events(limit: 30) {
      nodes {
        id
        title
        startDate
        isOnline
        attendeeCount
        maxAttendees
        isAttending
        isWaitlisted
        location {
          name
        }
      }
    }
  }
`;
export const EVENT = gql`
  ${USER}
  query Event($id: ID!) {
    event(id: $id) {
      id
      title
      description
      startDate
      endDate
      isOnline
      meetingUrl
      maxAttendees
      attendeeCount
      waitlistCount
      isAttending
      isWaitlisted
      isHost
      category
      location {
        name
        address
      }
      host {
        ...UserBasic
      }
      attendees(limit: 30) {
        ...UserBasic
      }
    }
  }
`;
export const CREATE_EVENT = gql`mutation CreateEvent($input: EventInput!) { createEvent(input: $input) { id } }`;
export const RSVP = gql`mutation Rsvp($id: ID!, $attending: Boolean!) { rsvpEvent(eventId: $id, attending: $attending) { id isAttending isWaitlisted attendeeCount waitlistCount } }`;
export const CANCEL_RSVP = gql`mutation CancelRsvp($id: ID!) { cancelEventRSVP(eventId: $id) { id isAttending isWaitlisted attendeeCount waitlistCount } }`;

export const PAGES = gql`
  query Pages($search: String) {
    pages(search: $search, limit: 30) {
      nodes {
        id
        name
        handle
        description
        category
        followerCount
        isFollowing
        isVerified
      }
    }
  }
`;
export const PAGE = gql`
  query PageDetail($id: String!) {
    page(id: $id) {
      id
      name
      handle
      description
      category
      website
      location
      followerCount
      isFollowing
      isAdmin
      isVerified
    }
  }
`;
export const PAGE_POSTS = gql`
  ${POST}
  query PagePosts($id: ID!) {
    pagePosts(pageId: $id, limit: 15) {
      nodes {
        ...PostFields
      }
    }
  }
`;
export const CREATE_PAGE = gql`mutation CreatePage($name: String!, $handle: String!, $description: String!, $category: String) { createPage(name: $name, handle: $handle, description: $description, category: $category) { id handle } }`;
export const FOLLOW_PAGE = gql`mutation FollowPage($id: ID!) { followPage(pageId: $id) { id isFollowing followerCount } }`;
export const UNFOLLOW_PAGE = gql`mutation UnfollowPage($id: ID!) { unfollowPage(pageId: $id) { id isFollowing followerCount } }`;

/* ---------------- creator & ads ---------------- */

export const CREATOR = gql`
  ${USER}
  query Creator {
    paymentMode
    creatorDashboard {
      totalEarnings
      totalTips
      totalSubscriptions
      subscriberCount
      tipsByMonth {
        month
        total
      }
      recentTips {
        id
        amount
        message
        isAnonymous
        createdAt
        sender {
          ...UserBasic
        }
      }
    }
    mySubscribers {
      id
      tier
      price
      endDate
      subscriber {
        ...UserBasic
      }
    }
    mySubscriptions {
      id
      tier
      price
      endDate
      creator {
        ...UserBasic
      }
    }
    myAds {
      id
      title
      status
      budget
      spent
      impressions
      clicks
      ctr
      endDate
    }
  }
`;
export const TIERS = gql`query Tiers { subscriptionTiers { key name price benefits } paymentMode }`;
export const SEND_TIP = gql`mutation Tip($to: ID!, $amount: Float!, $message: String, $anon: Boolean) { sendTip(recipientId: $to, amount: $amount, message: $message, isAnonymous: $anon) { tip { id paymentStatus } payment { mode status clientSecret } } }`;
export const SUBSCRIBE = gql`mutation Subscribe($creatorId: ID!, $tier: String!) { createSubscription(creatorId: $creatorId, tier: $tier) { subscription { id } payment { mode status } } }`;
export const CANCEL_SUBSCRIPTION = gql`mutation CancelSub($id: ID!) { cancelSubscription(subscriptionId: $id) }`;
export const CREATE_AD = gql`mutation CreateAd($title: String!, $description: String!, $targetUrl: String!, $audience: AdTargetAudienceInput!, $budget: Float!, $start: String!, $end: String!, $mediaUrls: [String!]) { createAd(title: $title, description: $description, targetUrl: $targetUrl, targetAudience: $audience, budget: $budget, startDate: $start, endDate: $end, mediaUrls: $mediaUrls) { ad { id } payment { mode status } } }`;
export const PAUSE_AD = gql`mutation PauseAd($id: ID!) { pauseAd(adId: $id) { id status } }`;
export const RESUME_AD = gql`mutation ResumeAd($id: ID!) { resumeAd(adId: $id) { id status } }`;
export const ADS_FOR_YOU = gql`query AdsForYou { adsForYou(limit: 1) { id title description targetUrl media { url } advertiser { username } } }`;
export const AD_IMPRESSION = gql`mutation AdImpression($id: ID!) { recordAdImpression(adId: $id) }`;
export const AD_CLICK = gql`mutation AdClick($id: ID!) { recordAdClick(adId: $id) }`;

/* ---------------- analytics & webhooks ---------------- */

export const MY_ANALYTICS = gql`
  query MyAnalytics {
    myAnalytics {
      totalPosts
      totalLikes
      totalComments
      totalShares
      totalFollowers
      totalFollowing
      profileViews
      engagementRate
      dailyActivity {
        date
        events
      }
      topPosts {
        id
        content
        likeCount
        commentCount
      }
    }
  }
`;
export const TRACK = gql`mutation Track($type: String!, $targetUserId: ID, $postId: ID) { trackEvent(eventType: $type, targetUserId: $targetUserId, postId: $postId) { id } }`;
export const WEBHOOKS = gql`
  query Webhooks {
    myWebhooks {
      id
      url
      events
      isActive
      triggerCount
      failureCount
      lastStatus
      lastTriggered
    }
    webhookEvents
  }
`;
export const CREATE_WEBHOOK = gql`mutation CreateWebhook($url: String!, $events: [String!]!) { createWebhook(url: $url, events: $events) { id secret } }`;
export const DELETE_WEBHOOK = gql`mutation DeleteWebhook($id: ID!) { deleteWebhook(webhookId: $id) }`;
