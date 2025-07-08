import { promises as fs } from 'fs';
import path from 'path';
import { TEMP_FILE_SUFFIX } from './utils/constants';

export interface FsProvider {
  readFile(filepath: string): Promise<string | null>;
  writeFile(filepath: string, content: string, encoding: 'utf-8'): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(dir: string, options: { recursive: true }): Promise<string | undefined>;
}

export const defaultFsProvider: FsProvider = {
  readFile: async (filepath: string): Promise<string | null> => {
    try {
      return await fs.readFile(filepath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  },
  writeFile: (filepath: string, content: string, encoding: 'utf-8'): Promise<void> => {
    return fs.writeFile(filepath, content, encoding);
  },
  rename: fs.rename,
  mkdir: fs.mkdir,
};

export const writeAtomic = async (
  filepath: string,
  content: string,
  fsProvider: FsProvider,
): Promise<void> => {
    // Adding Date.now() for uniqueness in case of concurrent operations
    const tempFilepath = `${filepath}.${Date.now()}${TEMP_FILE_SUFFIX}`;
    await fsProvider.mkdir(path.dirname(filepath), { recursive: true });
    await fsProvider.writeFile(tempFilepath, content, 'utf-8');
    await fsProvider.rename(tempFilepath, filepath);
};