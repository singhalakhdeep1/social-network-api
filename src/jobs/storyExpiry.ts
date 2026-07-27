/**
 * STORY EXPIRY CRON JOB
 * 
 * Automatically deletes expired stories every hour
 */

import cron from 'node-cron';
import Story from '../models/Story';

/**
 * Delete expired stories
 * Runs every hour
 */
const deleteExpiredStories = async () => {
  try {
    const now = new Date();
    const expiredStories = await Story.find({
      expiresAt: { $lt: now },
      isArchived: false
    });

    if (expiredStories.length > 0) {
      await Story.deleteMany({
        expiresAt: { $lt: now },
        isArchived: false
      });
      console.log(`✅ Deleted ${expiredStories.length} expired stories at ${now.toISOString()}`);
    }
  } catch (error) {
    console.error('❌ Error deleting expired stories:', error);
  }
};

/**
 * Start the story expiry cron job
 * Runs every hour at minute 0
 */
export const startStoryExpiryJob = () => {
  // Run every hour
  cron.schedule('0 * * * *', deleteExpiredStories);
  console.log('🗓️ Story expiry cron job started (runs every hour)');
  
  // Run immediately on startup to catch any expired stories
  deleteExpiredStories();
};

/**
 * Manually trigger story expiry (for testing)
 */
export const triggerStoryExpiry = async () => {
  await deleteExpiredStories();
};

export default { startStoryExpiryJob, triggerStoryExpiry };
