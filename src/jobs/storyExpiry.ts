/**
 * Story expiry: archives stories 24 h after posting (owners keep them in their archive and in
 * highlights; they disappear from everyone else's tray).
 */
import { archiveExpiredStories } from '../services/story.service';
import logger from '../utils/logger';

export const runStoryExpiry = async (): Promise<number> => {
  const archived = await archiveExpiredStories();
  if (archived > 0) logger.info(`Archived ${archived} expired stories`);
  return archived;
};
