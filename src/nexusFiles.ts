export interface INexusModFile {
  file_id: number;
  category_id: number;
  uploaded_timestamp: number;
}

export function mainFilesOrAll<T extends INexusModFile>(files: T[]): T[] {
  const mainFiles = files.filter(file => file.category_id === 1);
  return mainFiles.length > 0 ? mainFiles : files;
}

export function newestFile<T extends INexusModFile>(files: T[]): T | undefined {
  return [...files].sort((lhs, rhs) => rhs.uploaded_timestamp - lhs.uploaded_timestamp)[0];
}
