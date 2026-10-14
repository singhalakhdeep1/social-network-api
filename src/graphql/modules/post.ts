/**
 * Posts, comments, reactions, polls, the personalised feed and trending content.
 */
import { HydratedDocument } from 'mongoose';
import { Context, authed } from '../context';
import { IPost } from '../../models/Post';
import { IComment } from '../../models/Comment';
import { IReaction } from '../../models/Reaction';
import { IPoll } from '../../models/Poll';
import * as postSvc from '../../services/post.service';
import * as commentSvc from '../../services/comment.service';
import * as feedSvc from '../../services/feed.service';
import * as community from '../../services/community.service';
import { followingIds } from '../../services/follow.service';
import { resolveMedia, UploadedFile } from '../../utils/uploads';
import { pubsub, TOPICS } from '../../events/pubsub';
import { withFilter } from 'graphql-subscriptions';
import Reaction from '../../models/Reaction';

type PostDoc = HydratedDocument<IPost>;
type CommentDoc = HydratedDocument<IComment>;
type PageArgs = { limit?: number | null; cursor?: string | null };
type MaybeUpload = Promise<UploadedFile>;

export const typeDefs = /* GraphQL */ `
  type Post {
    id: ID!
    content: String!
    author: User!
    media: [Media!]!
    hashtags: [String!]!
    mentions: [User!]!
    likeCount: Int!
    commentCount: Int!
    sharesCount: Int!
    reactionCount: Int!
    "Emoji histogram"
    reactions: [ReactionCount!]!
    "The viewer's own emoji reaction"
    myReaction: String
    isLiked: Boolean!
    likes(limit: Int): [User!]!
    sharedFrom: Post
    group: Group
    page: Page
    poll: Poll
    isPinned: Boolean!
    isArchived: Boolean!
    moderationStatus: String!
    comments(limit: Int, cursor: String): CommentPage!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Comment {
    id: ID!
    content: String!
    author: User!
    post: Post!
    parent: Comment
    mentions: [User!]!
    likeCount: Int!
    replyCount: Int!
    isLiked: Boolean!
    reactions: [ReactionCount!]!
    myReaction: String
    replies(limit: Int, cursor: String): CommentPage!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Reaction {
    id: ID!
    emoji: String!
    user: User!
    post: Post!
    comment: Comment
    createdAt: DateTime!
  }

  type PostPage {
    nodes: [Post!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type CommentPage {
    nodes: [Comment!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type FeedItem {
    post: Post!
    score: Float!
    reason: String!
  }

  type FeedPage {
    items: [FeedItem!]!
    nextCursor: String
    hasMore: Boolean!
  }

  type TrendingHashtag {
    tag: String!
    count: Int!
  }

  type PollOption {
    id: ID!
    text: String!
    voteCount: Int!
    "Voter identities are only visible to the poll author"
    votes: [User!]!
  }

  type Poll {
    id: ID!
    post: Post!
    author: User!
    question: String!
    options: [PollOption!]!
    multipleChoice: Boolean!
    maxChoices: Int
    expiresAt: DateTime
    isActive: Boolean!
    totalVotes: Int!
    myVotes: [ID!]!
    hasVoted: Boolean!
    createdAt: DateTime!
  }

  extend type Query {
    post(id: ID!): Post!
    "Explore: newest public posts"
    posts(limit: Int, cursor: String): PostPage!
    userPosts(userId: ID!, limit: Int, cursor: String): PostPage!
    archivedPosts(limit: Int, cursor: String): PostPage!
    groupPosts(groupId: ID!, limit: Int, cursor: String): PostPage!
    pagePosts(pageId: ID!, limit: Int, cursor: String): PostPage!
    postsByHashtag(hashtag: String!, limit: Int, cursor: String): PostPage!
    trendingHashtags(limit: Int): [TrendingHashtag!]!
    trendingPosts(limit: Int): [Post!]!
    """
    Ranked feed: recency decay + engagement + affinity, paged by cursor.
    Pass refresh: true to bypass the 60 s ranking cache.
    """
    feed(limit: Int, cursor: String, refresh: Boolean): FeedPage!
    comments(postId: ID!, limit: Int, cursor: String): CommentPage!
    commentReplies(commentId: ID!, limit: Int, cursor: String): CommentPage!
    poll(id: ID!): Poll!
  }

  extend type Mutation {
    createPost(content: String, media: [Upload!], mediaUrls: [String!], groupId: ID, pageId: ID): Post!
    updatePost(id: ID!, content: String!): Post!
    deletePost(id: ID!): Boolean!
    likePost(postId: ID!): Post!
    unlikePost(postId: ID!): Post!
    "Reposts a post to your followers, optionally with a comment"
    sharePost(postId: ID!, comment: String): Post!
    pinPost(postId: ID!): Post!
    unpinPost(postId: ID!): Post!
    archivePost(postId: ID!): Post!
    unarchivePost(postId: ID!): Post!

    addComment(postId: ID!, content: String!, parentId: ID): Comment!
    deleteComment(id: ID!): Boolean!
    likeComment(commentId: ID!): Comment!
    unlikeComment(commentId: ID!): Comment!

    addReaction(postId: ID!, emoji: String!, commentId: ID): Reaction!
    removeReaction(postId: ID!, commentId: ID): Boolean!

    createPoll(postId: ID!, question: String!, options: [String!]!, multipleChoice: Boolean, maxChoices: Int, expiresAt: String): Poll!
    votePoll(pollId: ID!, optionIds: [ID!]!): Poll!
    closePoll(pollId: ID!): Poll!
  }

  extend type Subscription {
    "New posts from people you follow (and yourself)"
    postCreated: Post!
    postLiked(postId: ID!): Post!
    commentAdded(postId: ID!): Comment!
    reactionAdded(postId: ID!): Reaction!
    "Fires when someone you follow publishes; use it to show a 'new posts' pill"
    feedUpdated: Post!
  }
`;

const mediaOf = (uploads?: MaybeUpload[] | null, urls?: string[] | null) => resolveMedia(uploads, urls);

export const resolvers = {
  Query: {
    post: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const post = await postSvc.getVisiblePost(ctx.user?.id, id);
      return post;
    },
    posts: (_: unknown, args: PageArgs, ctx: Context) => postSvc.explorePosts(ctx.user?.id, args),
    userPosts: (_: unknown, { userId, ...page }: { userId: string } & PageArgs, ctx: Context) => postSvc.userPosts(ctx.user?.id, userId, page),
    archivedPosts: (_: unknown, args: PageArgs, ctx: Context) => postSvc.archivedPosts(authed(ctx).id, args),
    groupPosts: (_: unknown, { groupId, ...page }: { groupId: string } & PageArgs, ctx: Context) => postSvc.groupPosts(ctx.user?.id, groupId, page),
    pagePosts: (_: unknown, { pageId, ...page }: { pageId: string } & PageArgs) => postSvc.pagePosts(pageId, page),
    postsByHashtag: (_: unknown, { hashtag, ...page }: { hashtag: string } & PageArgs, ctx: Context) => postSvc.postsByHashtag(ctx.user?.id, hashtag, page),
    trendingHashtags: (_: unknown, { limit }: { limit?: number }) => postSvc.trendingHashtags(limit ?? 10),
    trendingPosts: (_: unknown, { limit }: { limit?: number }, ctx: Context) => postSvc.trendingPosts(ctx.user?.id, limit ?? 10),
    feed: (_: unknown, args: PageArgs & { refresh?: boolean }, ctx: Context) => feedSvc.getFeed(authed(ctx).id, args),
    comments: (_: unknown, { postId, ...page }: { postId: string } & PageArgs, ctx: Context) => commentSvc.listComments(ctx.user?.id, postId, page),
    commentReplies: (_: unknown, { commentId, ...page }: { commentId: string } & PageArgs) => commentSvc.listReplies(commentId, page),
    poll: (_: unknown, { id }: { id: string }, ctx: Context) => community.getPoll(ctx.user?.id, id)
  },

  Mutation: {
    createPost: async (_: unknown, args: { content?: string; media?: MaybeUpload[]; mediaUrls?: string[]; groupId?: string; pageId?: string }, ctx: Context) => {
      const user = authed(ctx);
      const media = await mediaOf(args.media, args.mediaUrls);
      return postSvc.createPost(user.id, { content: args.content, media, groupId: args.groupId, pageId: args.pageId });
    },
    updatePost: (_: unknown, { id, content }: { id: string; content: string }, ctx: Context) => postSvc.updatePost(authed(ctx).id, id, content),
    deletePost: (_: unknown, { id }: { id: string }, ctx: Context) => postSvc.deletePost(authed(ctx), id),
    likePost: (_: unknown, { postId }: { postId: string }, ctx: Context) => postSvc.likePost(authed(ctx).id, postId),
    unlikePost: (_: unknown, { postId }: { postId: string }, ctx: Context) => postSvc.unlikePost(authed(ctx).id, postId),
    sharePost: (_: unknown, { postId, comment }: { postId: string; comment?: string }, ctx: Context) => postSvc.sharePost(authed(ctx).id, postId, comment),
    pinPost: (_: unknown, { postId }: { postId: string }, ctx: Context) => postSvc.setPinned(authed(ctx).id, postId, true),
    unpinPost: (_: unknown, { postId }: { postId: string }, ctx: Context) => postSvc.setPinned(authed(ctx).id, postId, false),
    archivePost: (_: unknown, { postId }: { postId: string }, ctx: Context) => postSvc.setArchived(authed(ctx).id, postId, true),
    unarchivePost: (_: unknown, { postId }: { postId: string }, ctx: Context) => postSvc.setArchived(authed(ctx).id, postId, false),

    addComment: (_: unknown, { postId, content, parentId }: { postId: string; content: string; parentId?: string }, ctx: Context) => commentSvc.addComment(authed(ctx).id, postId, content, parentId),
    deleteComment: (_: unknown, { id }: { id: string }, ctx: Context) => commentSvc.deleteComment(authed(ctx), id),
    likeComment: (_: unknown, { commentId }: { commentId: string }, ctx: Context) => commentSvc.likeComment(authed(ctx).id, commentId),
    unlikeComment: (_: unknown, { commentId }: { commentId: string }, ctx: Context) => commentSvc.unlikeComment(authed(ctx).id, commentId),

    addReaction: (_: unknown, { postId, emoji, commentId }: { postId: string; emoji: string; commentId?: string }, ctx: Context) => postSvc.addReaction(authed(ctx).id, postId, emoji, commentId),
    removeReaction: (_: unknown, { postId, commentId }: { postId: string; commentId?: string }, ctx: Context) => postSvc.removeReaction(authed(ctx).id, postId, commentId),

    createPoll: (_: unknown, { postId, ...input }: { postId: string; question: string; options: string[]; multipleChoice?: boolean; maxChoices?: number; expiresAt?: string }, ctx: Context) =>
      community.createPoll(authed(ctx).id, postId, input),
    votePoll: (_: unknown, { pollId, optionIds }: { pollId: string; optionIds: string[] }, ctx: Context) => community.votePoll(authed(ctx).id, pollId, optionIds),
    closePoll: (_: unknown, { pollId }: { pollId: string }, ctx: Context) => community.closePoll(authed(ctx).id, pollId)
  },

  Subscription: {
    postCreated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(TOPICS.POST_CREATED),
        async (payload: { authorId: string }, _args: unknown, ctx: Context) =>
          !!ctx.user && (payload.authorId === ctx.user.id || (await followingIds(ctx.user.id)).includes(payload.authorId))
      ),
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.post.load(p.id)
    },
    postLiked: {
      subscribe: async (_: unknown, { postId }: { postId: string }, ctx: Context) => {
        await postSvc.getVisiblePost(ctx.user?.id, postId);
        return pubsub.asyncIterator(TOPICS.POST_LIKED(postId));
      },
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.post.load(p.id)
    },
    commentAdded: {
      subscribe: async (_: unknown, { postId }: { postId: string }, ctx: Context) => {
        await postSvc.getVisiblePost(ctx.user?.id, postId);
        return pubsub.asyncIterator(TOPICS.COMMENT_ADDED(postId));
      },
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.comment.load(p.id)
    },
    reactionAdded: {
      subscribe: async (_: unknown, { postId }: { postId: string }, ctx: Context) => {
        await postSvc.getVisiblePost(ctx.user?.id, postId);
        return pubsub.asyncIterator(TOPICS.REACTION_ADDED(postId));
      },
      resolve: (p: { id: string }) => Reaction.findById(p.id)
    },
    feedUpdated: {
      subscribe: async (_: unknown, __: unknown, ctx: Context) => pubsub.asyncIterator(TOPICS.FEED_UPDATED(authed(ctx).id)),
      resolve: (p: { id: string }, _: unknown, ctx: Context) => ctx.loaders.post.load(p.id)
    }
  },

  Post: {
    author: (p: PostDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(p.author.toString()),
    media: (p: PostDoc) => p.media ?? [],
    mentions: (p: PostDoc, _: unknown, ctx: Context) => Promise.all((p.mentions ?? []).map((id) => ctx.loaders.user.load(id.toString()))).then((l) => l.filter(Boolean)),
    reactions: (p: PostDoc, _: unknown, ctx: Context) => ctx.loaders.reactionSummary.load(`p:${p.id}`),
    myReaction: (p: PostDoc, _: unknown, ctx: Context) => (ctx.user ? ctx.loaders.myReaction.load(`p:${p.id}`) : null),
    isLiked: (p: PostDoc, _: unknown, ctx: Context) => (ctx.user ? ctx.loaders.postLiked.load(p.id) : false),
    likes: (p: PostDoc, { limit }: { limit?: number }) => postSvc.postLikers(p.id, limit ?? 20),
    sharedFrom: (p: PostDoc, _: unknown, ctx: Context) => (p.sharedFrom ? ctx.loaders.post.load(p.sharedFrom.toString()) : null),
    group: (p: PostDoc, _: unknown, ctx: Context) => (p.group ? ctx.loaders.group.load(p.group.toString()) : null),
    page: (p: PostDoc, _: unknown, ctx: Context) => (p.page ? ctx.loaders.page.load(p.page.toString()) : null),
    poll: (p: PostDoc, _: unknown, ctx: Context) => ctx.loaders.pollForPost.load(p.id),
    comments: (p: PostDoc, args: PageArgs, ctx: Context) => commentSvc.listComments(ctx.user?.id, p.id, args)
  },

  Comment: {
    author: (c: CommentDoc, _: unknown, ctx: Context) => ctx.loaders.user.load(c.author.toString()),
    post: (c: CommentDoc, _: unknown, ctx: Context) => ctx.loaders.post.load(c.post.toString()),
    parent: (c: CommentDoc, _: unknown, ctx: Context) => (c.parent ? ctx.loaders.comment.load(c.parent.toString()) : null),
    mentions: (c: CommentDoc, _: unknown, ctx: Context) => Promise.all((c.mentions ?? []).map((id) => ctx.loaders.user.load(id.toString()))).then((l) => l.filter(Boolean)),
    isLiked: (c: CommentDoc, _: unknown, ctx: Context) => (ctx.user ? ctx.loaders.commentLiked.load(c.id) : false),
    reactions: (c: CommentDoc, _: unknown, ctx: Context) => ctx.loaders.reactionSummary.load(`c:${c.id}`),
    myReaction: (c: CommentDoc, _: unknown, ctx: Context) => (ctx.user ? ctx.loaders.myReaction.load(`c:${c.id}`) : null),
    replies: (c: CommentDoc, args: PageArgs) => commentSvc.listReplies(c.id, args)
  },

  Reaction: {
    user: (r: HydratedDocument<IReaction>, _: unknown, ctx: Context) => ctx.loaders.user.load(r.user.toString()),
    post: (r: HydratedDocument<IReaction>, _: unknown, ctx: Context) => ctx.loaders.post.load(r.post.toString()),
    comment: (r: HydratedDocument<IReaction>, _: unknown, ctx: Context) => (r.comment ? ctx.loaders.comment.load(r.comment.toString()) : null)
  },

  Poll: {
    // voter identities are only exposed to the poll's author
    options: (p: HydratedDocument<IPoll>, _: unknown, ctx: Context) =>
      p.options.map((o) => ({ id: o.id, text: o.text, voteCount: o.voteCount, votes: ctx.user?.id === p.author.toString() ? o.votes : [] })),
    post: (p: HydratedDocument<IPoll>, _: unknown, ctx: Context) => ctx.loaders.post.load(p.post.toString()),
    author: (p: HydratedDocument<IPoll>, _: unknown, ctx: Context) => ctx.loaders.user.load(p.author.toString()),
    isActive: (p: HydratedDocument<IPoll>) => community.pollIsActive(p),
    myVotes: (p: HydratedDocument<IPoll>, _: unknown, ctx: Context) => (ctx.user ? p.options.filter((o) => o.votes.some((v) => v.toString() === ctx.user!.id)).map((o) => o.id) : []),
    hasVoted: (p: HydratedDocument<IPoll>, _: unknown, ctx: Context) => !!ctx.user && p.options.some((o) => o.votes.some((v) => v.toString() === ctx.user!.id))
  },

  PollOption: {
    votes: (o: { votes: { toString(): string }[] }, _: unknown, ctx: Context) => Promise.all(o.votes.map((id) => ctx.loaders.user.load(id.toString()))).then((l) => l.filter(Boolean))
  }
};
