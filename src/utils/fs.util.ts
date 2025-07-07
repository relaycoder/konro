import { promises as fs } from 'fs';
import path from 'path';
import { TEMP_FILE_SUFFIX } from './constants';

export const readFile = async (filepath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filepath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

export const writeAtomic = async (filepath: string, content: string): Promise<void> => {
    // Adding Date.now() for uniqueness in case of concurrent operations
    const tempFilepath = `${filepath}.${Date.now()}${TEMP_FILE_SUFFIX}`;
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(tempFilepath, content, 'utf-8');
    await fs.rename(tempFilepath, filepath);
};