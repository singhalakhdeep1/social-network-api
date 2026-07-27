/**
 * EXTENDED RESOLVERS
 * 
 * For Direct Messaging, Stories, Content Management, Social Features, Monetization, and Integrations
 */

import { PubSub } from 'graphql-subscriptions';
import Message from '../../models/Message';
import Conversation from '../../models/Conversation';
import Story from '../../models/Story';
import StoryReply from '../../models/StoryReply';
import StoryHighlight from '../../models/StoryHighlight';
import ScheduledPost from '../../models/ScheduledPost';
import DraftPost from '../../models/DraftPost';
import Poll from '../../models/Poll';
import Event from '../../models/Event';
import Group from '../../models/Group';
import Page from '../../models/Page';
import Tip from '../../models/Tip';
import Subscription from '../../models/Subscription';
import Ad from '../../models/Ad';
import Webhook from '../../models/Webhook';
import SavedSearch from '../../models/SavedSearch';
import User from '../../models/User';
import Post from '../../models/Post';

const pubsub = new PubSub();

export const extendedResolvers = {
  // ==================== DIRECT MESSAGING RESOLVERS ====================
  
  Query: {
    conversations: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Conversation.find({ 
        participants: context.user.id,
        isArchived: false 
      }).sort({ lastMessageAt: -1 }).limit(20);
    },
    
    conversation: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Conversation.findById(id);
    },
    
    messages: async (_: any, { conversationId, cursor, limit = 50 }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      const query: any = { conversation: conversationId };
      if (cursor) query._id = { $lt: cursor };
      
      return Message.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('sender')
        .populate('replyTo');
    },
    
    searchMessages: async (_: any, { query, conversationId }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      const searchQuery: any = { content: { $regex: query, $options: 'i' } };
      if (conversationId) searchQuery.conversation = conversationId;
      
      return Message.find(searchQuery)
        .populate('sender')
        .limit(50);
    },
    
    // Stories Queries
    myStories: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Story.find({ 
        author: context.user.id,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 });
    },
    
    userStories: async (_: any, { userId }: { userId: string }, __: any) => {
      return Story.find({ 
        author: userId,
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 });
    },
    
    story: async (_: any, { id }: { id: string }, __: any) => {
      return Story.findById(id);
    },
    
    storyFeed: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      const following = await User.findById(context.user.id).select('following');
      const userIds = following?.following || [];
      userIds.push(context.user.id);
      
      return Story.find({ 
        author: { $in: userIds },
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: -1 });
    },
    
    userStoryHighlights: async (_: any, { userId }: { userId: string }, __: any) => {
      return StoryHighlight.find({ author: userId });
    },
    
    // Content Management Queries
    myScheduledPosts: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return ScheduledPost.find({ 
        author: context.user.id,
        status: 'pending'
      }).sort({ scheduledFor: 1 });
    },
    
    myDraftPosts: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return DraftPost.find({ author: context.user.id }).sort({ updatedAt: -1 });
    },
    
    contentCalendar: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      const scheduled = await ScheduledPost.find({ 
        author: context.user.id,
        status: 'pending'
      });
      const drafts = await DraftPost.find({ author: context.user.id });
      
      return {
        posts: scheduled,
        drafts,
        totalScheduled: scheduled.length,
        totalDrafts: drafts.length
      };
    },
    
    // Social Features Queries
    poll: async (_: any, { id }: { id: string }, __: any) => {
      return Poll.findById(id);
    },
    
    event: async (_: any, { id }: { id: string }, __: any) => {
      return Event.findById(id);
    },
    
    events: async (_: any, { limit = 20, category }: any, __: any) => {
      const query: any = { startDate: { $gte: new Date() } };
      if (category) query.category = category;
      
      return Event.find(query)
        .sort({ startDate: 1 })
        .limit(limit);
    },
    
    myEvents: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Event.find({ attendees: context.user.id })
        .sort({ startDate: 1 });
    },
    
    group: async (_: any, { id }: { id: string }, __: any) => {
      return Group.findById(id);
    },
    
    groups: async (_: any, { limit = 20, category }: any, __: any) => {
      const query: any = { isPrivate: false };
      if (category) query.category = category;
      
      return Group.find(query).sort({ memberCount: -1 }).limit(limit);
    },
    
    myGroups: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Group.find({ members: context.user.id });
    },
    
    page: async (_: any, { id }: { id: string }, __: any) => {
      return Page.findById(id);
    },
    
    pages: async (_: any, { limit = 20, category }: any, __: any) => {
      const query: any = {};
      if (category) query.category = category;
      
      return Page.find(query).sort({ followerCount: -1 }).limit(limit);
    },
    
    myPages: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Page.find({ $or: [{ owner: context.user.id }, { admins: context.user.id }] });
    },
    
    // Monetization Queries
    myTips: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Tip.find({ sender: context.user.id }).sort({ createdAt: -1 });
    },
    
    receivedTips: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Tip.find({ recipient: context.user.id }).sort({ createdAt: -1 });
    },
    
    mySubscriptions: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Subscription.find({ 
        subscriber: context.user.id,
        isActive: true 
      });
    },
    
    creatorSubscriptions: async (_: any, { creatorId }: { creatorId: string }, __: any) => {
      return Subscription.find({ 
        creator: creatorId,
        isActive: true 
      });
    },
    
    myAds: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Ad.find({ advertiser: context.user.id });
    },
    
    ad: async (_: any, { id }: { id: string }, __: any) => {
      return Ad.findById(id);
    },
    
    subscriptionTiers: async () => {
      return [
        { name: 'Basic', price: 4.99, benefits: ['Exclusive posts', 'Direct messaging'] },
        { name: 'Standard', price: 9.99, benefits: ['All Basic benefits', 'Early access', 'Badge'] },
        { name: 'Premium', price: 19.99, benefits: ['All Standard benefits', '1-on-1 calls', 'Exclusive content'] }
      ];
    },
    
    creatorDashboard: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      const tips = await Tip.find({ recipient: context.user.id, paymentStatus: 'completed' });
      const subscriptions = await Subscription.find({ creator: context.user.id, isActive: true });
      const ads = await Ad.find({ advertiser: context.user.id, status: 'active' });
      
      const totalTips = tips.reduce((sum: number, tip: any) => sum + tip.amount, 0);
      const totalSubscriptions = subscriptions.reduce((sum: number, sub: any) => sum + sub.price, 0);
      
      return {
        totalEarnings: totalTips + totalSubscriptions,
        totalTips,
        totalSubscriptions,
        subscriberCount: subscriptions.length,
        activeAds: ads,
        recentTips: tips.slice(0, 10)
      };
    },
    
    // Integrations Queries
    myWebhooks: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Webhook.find({ user: context.user.id });
    },
    
    webhook: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return Webhook.findOne({ _id: id, user: context.user.id });
    },
    
    savedSearches: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      return SavedSearch.find({ user: context.user.id });
    },
    
    searchHistory: async (_: any, { limit = 20 }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      // This would query a SearchHistory model
      return [];
    },
    
    // Advanced Search Queries
    advancedSearch: async (_: any, { query, filters, limit = 20 }: any, __: any) => {
      // This would integrate with Elasticsearch
      const searchQuery: any = { content: { $regex: query, $options: 'i' } };
      
      if (filters?.dateRange) {
        searchQuery.createdAt = {
          $gte: new Date(filters.dateRange.start),
          $lte: new Date(filters.dateRange.end)
        };
      }
      
      return Post.find(searchQuery).limit(limit);
    },
    
    autocompleteSuggestions: async (_: any, { query, limit = 10 }: any, __: any) => {
      // This would integrate with Elasticsearch
      const users = await User.find({ 
        username: { $regex: query, $options: 'i' } 
      }).limit(limit).select('username');
      
      return users.map((u: any) => u.username);
    }
  },
  
  Mutation: {
    // Direct Messaging Mutations
    createConversation: async (_: any, { participantIds, isGroup, groupName }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const conversation = new Conversation({
        participants: [...participantIds, context.user.id],
        isGroup,
        groupName,
        createdBy: context.user.id,
        admins: isGroup ? [context.user.id] : []
      });
      
      await conversation.save();
      return conversation;
    },
    
    sendMessage: async (_: any, { conversationId, content, media, replyTo }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const message = new Message({
        conversation: conversationId,
        sender: context.user.id,
        content,
        media: media ? [{ url: media, type: 'image' }] : [],
        replyTo
      });
      
      await message.save();
      
      // Update conversation
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        lastMessageAt: new Date()
      });
      
      pubsub.publish('MESSAGE_SENT', { messageSent: message, conversationId });
      
      return message;
    },
    
    markMessagesAsRead: async (_: any, { conversationId }: { conversationId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Message.updateMany(
        { conversation: conversationId, sender: { $ne: context.user.id } },
        { isRead: true, readAt: new Date() }
      );
      
      return true;
    },
    
    deleteMessage: async (_: any, { messageId }: { messageId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Message.findByIdAndUpdate(messageId, { isDeleted: true });
      return true;
    },
    
    addMessageReaction: async (_: any, { messageId, emoji }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const message = await Message.findByIdAndUpdate(
        messageId,
        { $push: { reactions: { emoji, userId: context.user.id } } },
        { new: true }
      );
      
      return message?.reactions.find((r: any) => r.emoji === emoji && r.userId.toString() === context.user.id);
    },
    
    setTypingIndicator: async (_: any, { conversationId, isTyping }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) throw new Error('Conversation not found');
      
      if (isTyping) {
        await Conversation.findByIdAndUpdate(
          conversationId,
          { $addToSet: { typingUsers: context.user.id } }
        );
      } else {
        await Conversation.findByIdAndUpdate(
          conversationId,
          { $pull: { typingUsers: context.user.id } }
        );
      }
      
      pubsub.publish('TYPING_INDICATOR', {
        typingIndicator: {
          userId: context.user.id,
          conversationId,
          isTyping
        }
      });
      
      return true;
    },
    
    archiveConversation: async (_: any, { conversationId }: { conversationId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Conversation.findByIdAndUpdate(
        conversationId,
        { isArchived: true, $addToSet: { archivedBy: context.user.id } }
      );
      
      return true;
    },
    
    muteConversation: async (_: any, { conversationId, until }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Conversation.findByIdAndUpdate(
        conversationId,
        { 
          isMuted: true,
          $addToSet: { 
            mutedBy: { userId: context.user.id, until: until ? new Date(until) : null }
          }
        }
      );
      
      return true;
    },
    
    // Stories Mutations
    createStory: async (_: any, { media, content }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const story = new Story({
        author: context.user.id,
        media: [{ url: media, type: 'image' }],
        content,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      
      await story.save();
      
      pubsub.publish('STORY_CREATED', { storyCreated: story, userId: context.user.id });
      
      return story;
    },
    
    viewStory: async (_: any, { storyId }: { storyId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const story = await Story.findByIdAndUpdate(
        storyId,
        { $addToSet: { viewers: context.user.id }, $inc: { viewerCount: 1 } },
        { new: true }
      );
      
      pubsub.publish('STORY_VIEWED', { storyViewed: story, storyId });
      
      return story;
    },
    
    addStoryReaction: async (_: any, { storyId, emoji }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const story = await Story.findByIdAndUpdate(
        storyId,
        { $push: { reactions: { emoji, userId: context.user.id } } },
        { new: true }
      );
      
      pubsub.publish('STORY_REACTION_ADDED', {
        storyReactionAdded: { emoji, user: context.user },
        storyId
      });
      
      return story?.reactions.find((r: any) => r.emoji === emoji && r.userId.toString() === context.user.id);
    },
    
    addStoryReply: async (_: any, { storyId, content }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const reply = new StoryReply({
        story: storyId,
        author: context.user.id,
        content
      });
      
      await reply.save();
      
      await Story.findByIdAndUpdate(storyId, { $push: { replies: reply._id } });
      
      return reply;
    },
    
    deleteStory: async (_: any, { storyId }: { storyId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Story.findOneAndDelete({ _id: storyId, author: context.user.id });
      return true;
    },
    
    createStoryHighlight: async (_: any, { title, coverUrl, storyIds }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const highlight = new StoryHighlight({
        author: context.user.id,
        title,
        coverUrl,
        stories: storyIds
      });
      
      await highlight.save();
      
      // Mark stories as archived
      await Story.updateMany(
        { _id: { $in: storyIds } },
        { isArchived: true, highlightId: highlight._id }
      );
      
      return highlight;
    },
    
    deleteStoryHighlight: async (_: any, { highlightId }: { highlightId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await StoryHighlight.findOneAndDelete({ _id: highlightId, author: context.user.id });
      return true;
    },
    
    addToHighlight: async (_: any, { highlightId, storyId }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const highlight = await StoryHighlight.findByIdAndUpdate(
        highlightId,
        { $push: { stories: storyId } },
        { new: true }
      );
      
      await Story.findByIdAndUpdate(storyId, { isArchived: true, highlightId });
      
      return highlight;
    },
    
    removeFromHighlight: async (_: any, { highlightId, storyId }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const highlight = await StoryHighlight.findByIdAndUpdate(
        highlightId,
        { $pull: { stories: storyId } },
        { new: true }
      );
      
      await Story.findByIdAndUpdate(storyId, { isArchived: false, highlightId: null });
      
      return highlight;
    },
    
    // Content Management Mutations
    createDraft: async (_: any, { content, media }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const draft = new DraftPost({
        author: context.user.id,
        content,
        media: media ? [{ url: media, type: 'image' }] : []
      });
      
      await draft.save();
      return draft;
    },
    
    updateDraft: async (_: any, { id, content, media }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const updateData: any = { content };
      if (media) updateData.media = [{ url: media, type: 'image' }];
      
      return DraftPost.findOneAndUpdate(
        { _id: id, author: context.user.id },
        updateData,
        { new: true }
      );
    },
    
    deleteDraft: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await DraftPost.findOneAndDelete({ _id: id, author: context.user.id });
      return true;
    },
    
    schedulePost: async (_: any, { content, media, scheduledFor }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const scheduledPost = new ScheduledPost({
        author: context.user.id,
        content,
        media: media ? [{ url: media, type: 'image' }] : [],
        scheduledFor: new Date(scheduledFor)
      });
      
      await scheduledPost.save();
      return scheduledPost;
    },
    
    updateScheduledPost: async (_: any, { id, scheduledFor }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return ScheduledPost.findOneAndUpdate(
        { _id: id, author: context.user.id },
        { scheduledFor: new Date(scheduledFor) },
        { new: true }
      );
    },
    
    deleteScheduledPost: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await ScheduledPost.findOneAndDelete({ _id: id, author: context.user.id });
      return true;
    },
    
    publishScheduledPost: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const scheduledPost = await ScheduledPost.findById(id);
      if (!scheduledPost) throw new Error('Scheduled post not found');
      
      // Create actual post
      const post = new Post({
        author: scheduledPost.author,
        content: scheduledPost.content,
        media: scheduledPost.media,
        hashtags: scheduledPost.hashtags,
        mentions: scheduledPost.mentions
      });
      
      await post.save();
      
      // Update scheduled post status
      await ScheduledPost.findByIdAndUpdate(id, {
        status: 'published',
        publishedAt: new Date()
      });
      
      return post;
    },
    
    // Social Features Mutations
    createPoll: async (_: any, { postId, question, options, multipleChoice, maxChoices, expiresAt }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const pollOptions = options.map((text: string, index: number) => ({
        id: index.toString(),
        text,
        votes: [],
        voteCount: 0
      }));
      
      const poll = new Poll({
        post: postId,
        author: context.user.id,
        question,
        options: pollOptions,
        multipleChoice,
        maxChoices,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined
      });
      
      await poll.save();
      return poll;
    },
    
    votePoll: async (_: any, { pollId, optionIds }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const poll = await Poll.findById(pollId);
      if (!poll) throw new Error('Poll not found');
      
      // Remove existing votes
      poll.options.forEach((opt: any) => {
        opt.votes = opt.votes.filter((id: any) => id.toString() !== context.user.id);
        opt.voteCount = opt.votes.length;
      });
      
      // Add new votes
      optionIds.forEach((optionId: string) => {
        const option = poll.options.find((opt: any) => opt.id === optionId);
        if (option) {
          option.votes.push(context.user.id);
          option.voteCount = option.votes.length;
        }
      });
      
      poll.totalVotes = poll.options.reduce((sum: number, opt: any) => sum + opt.voteCount, 0);
      await poll.save();
      
      return poll;
    },
    
    createEvent: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const event = new Event({
        ...args,
        host: context.user.id,
        attendees: [],
        waitlist: []
      });
      
      await event.save();
      return event;
    },
    
    rsvpEvent: async (_: any, { eventId, attending }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const event = await Event.findById(eventId);
      if (!event) throw new Error('Event not found');
      
      if (attending) {
        if (event.maxAttendees && event.attendees.length >= event.maxAttendees) {
          // Add to waitlist
          await Event.findByIdAndUpdate(
            eventId,
            { $addToSet: { waitlist: context.user.id } }
          );
        } else {
          await Event.findByIdAndUpdate(
            eventId,
            { $addToSet: { attendees: context.user.id } }
          );
        }
      } else {
        await Event.findByIdAndUpdate(
          eventId,
          { $pull: { attendees: context.user.id, waitlist: context.user.id } }
        );
      }
      
      return Event.findById(eventId);
    },
    
    cancelEventRSVP: async (_: any, { eventId }: { eventId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Event.findByIdAndUpdate(
        eventId,
        { $pull: { attendees: context.user.id, waitlist: context.user.id } }
      );
      
      return Event.findById(eventId);
    },
    
    createGroup: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const group = new Group({
        ...args,
        creator: context.user.id,
        admins: [context.user.id],
        members: [context.user.id],
        memberCount: 1
      });
      
      await group.save();
      return group;
    },
    
    updateGroup: async (_: any, { groupId, ...args }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return Group.findOneAndUpdate(
        { _id: groupId, admins: context.user.id },
        args,
        { new: true }
      );
    },
    
    joinGroup: async (_: any, { groupId }: { groupId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const group = await Group.findByIdAndUpdate(
        groupId,
        { $addToSet: { members: context.user.id }, $inc: { memberCount: 1 } },
        { new: true }
      );
      
      return group;
    },
    
    leaveGroup: async (_: any, { groupId }: { groupId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const group = await Group.findByIdAndUpdate(
        groupId,
        { $pull: { members: context.user.id, admins: context.user.id }, $inc: { memberCount: -1 } },
        { new: true }
      );
      
      return group;
    },
    
    createPage: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const page = new Page({
        ...args,
        owner: context.user.id,
        admins: [context.user.id],
        followers: []
      });
      
      await page.save();
      return page;
    },
    
    updatePage: async (_: any, { pageId, ...args }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return Page.findOneAndUpdate(
        { _id: pageId, admins: context.user.id },
        args,
        { new: true }
      );
    },
    
    followPage: async (_: any, { pageId }: { pageId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return Page.findByIdAndUpdate(
        pageId,
        { $addToSet: { followers: context.user.id }, $inc: { followerCount: 1 } },
        { new: true }
      );
    },
    
    unfollowPage: async (_: any, { pageId }: { pageId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return Page.findByIdAndUpdate(
        pageId,
        { $pull: { followers: context.user.id }, $inc: { followerCount: -1 } },
        { new: true }
      );
    },
    
    // Monetization Mutations
    sendTip: async (_: any, { recipientId, amount, message, isAnonymous }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const tip = new Tip({
        sender: context.user.id,
        recipient: recipientId,
        amount,
        message,
        isAnonymous,
        paymentStatus: 'pending'
      });
      
      await tip.save();
      
      // Here you would integrate with Stripe for actual payment processing
      // For now, we'll mark it as completed
      await Tip.findByIdAndUpdate(tip._id, { paymentStatus: 'completed' });
      
      return tip;
    },
    
    createSubscription: async (_: any, { creatorId, tier }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const tiers: any = {
        basic: { price: 4.99, benefits: ['Exclusive posts', 'Direct messaging'] },
        standard: { price: 9.99, benefits: ['All Basic benefits', 'Early access', 'Badge'] },
        premium: { price: 19.99, benefits: ['All Standard benefits', '1-on-1 calls', 'Exclusive content'] }
      };
      
      const tierData = tiers[tier];
      
      const subscription = new Subscription({
        creator: creatorId,
        subscriber: context.user.id,
        tier,
        price: tierData.price,
        benefits: tierData.benefits,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });
      
      await subscription.save();
      
      // Here you would integrate with Stripe for actual payment
      
      return subscription;
    },
    
    cancelSubscription: async (_: any, { subscriptionId }: { subscriptionId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Subscription.findOneAndUpdate(
        { _id: subscriptionId, subscriber: context.user.id },
        { isActive: false, autoRenew: false }
      );
      
      return true;
    },
    
    createAd: async (_: any, args: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const ad = new Ad({
        ...args,
        advertiser: context.user.id,
        status: 'draft'
      });
      
      await ad.save();
      return ad;
    },
    
    updateAd: async (_: any, { adId, ...args }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return Ad.findOneAndUpdate(
        { _id: adId, advertiser: context.user.id },
        args,
        { new: true }
      );
    },
    
    pauseAd: async (_: any, { adId }: { adId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return Ad.findOneAndUpdate(
        { _id: adId, advertiser: context.user.id },
        { status: 'paused' },
        { new: true }
      );
    },
    
    resumeAd: async (_: any, { adId }: { adId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return Ad.findOneAndUpdate(
        { _id: adId, advertiser: context.user.id },
        { status: 'active' },
        { new: true }
      );
    },
    
    deleteAd: async (_: any, { adId }: { adId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Ad.findOneAndDelete({ _id: adId, advertiser: context.user.id });
      return true;
    },
    
    // Integrations Mutations
    createWebhook: async (_: any, { url, events }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const webhook = new Webhook({
        user: context.user.id,
        url,
        events,
        secret: Math.random().toString(36).substring(2, 15)
      });
      
      await webhook.save();
      return webhook;
    },
    
    updateWebhook: async (_: any, { webhookId, ...args }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      return Webhook.findOneAndUpdate(
        { _id: webhookId, user: context.user.id },
        args,
        { new: true }
      );
    },
    
    deleteWebhook: async (_: any, { webhookId }: { webhookId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await Webhook.findOneAndDelete({ _id: webhookId, user: context.user.id });
      return true;
    },
    
    createSavedSearch: async (_: any, { query, filters, name }: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      const savedSearch = new SavedSearch({
        user: context.user.id,
        query,
        filters,
        name
      });
      
      await savedSearch.save();
      return savedSearch;
    },
    
    deleteSavedSearch: async (_: any, { searchId }: { searchId: string }, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      
      await SavedSearch.findOneAndDelete({ _id: searchId, user: context.user.id });
      return true;
    },
    
    clearSearchHistory: async (_: any, __: any, context: any) => {
      if (!context.user) throw new Error('Not authenticated');
      // This would clear search history for the user
      return true;
    }
  },
  
  Subscription: {
    messageSent: {
      subscribe: (_: any, { conversationId }: { conversationId: string }) => 
        pubsub.asyncIterator(['MESSAGE_SENT'])
    },
    typingIndicator: {
      subscribe: (_: any, { conversationId }: { conversationId: string }) =>
        pubsub.asyncIterator(['TYPING_INDICATOR'])
    },
    conversationUpdated: {
      subscribe: (_: any, { userId }: { userId: string }) =>
        pubsub.asyncIterator(['CONVERSATION_UPDATED'])
    },
    storyCreated: {
      subscribe: (_: any, { userId }: { userId: string }) =>
        pubsub.asyncIterator(['STORY_CREATED'])
    },
    storyViewed: {
      subscribe: (_: any, { storyId }: { storyId: string }) =>
        pubsub.asyncIterator(['STORY_VIEWED'])
    },
    storyReactionAdded: {
      subscribe: (_: any, { storyId }: { storyId: string }) =>
        pubsub.asyncIterator(['STORY_REACTION_ADDED'])
    },
    eventRSVP: {
      subscribe: (_: any, { eventId }: { eventId: string }) =>
        pubsub.asyncIterator(['EVENT_RSVP'])
    }
  }
};

export default extendedResolvers;
