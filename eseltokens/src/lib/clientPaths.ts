export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/eseltokens';

export function appPath(path: string = '/') {
  if (path === '/') return `${basePath}/`;
  return `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
}

export function apiPath(path: string) {
  return `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
}
