export class UserError extends Error {}

// Browser API errors may contain credential material. Only display messages authored here.
export function publicError(error: unknown): string {
  return error instanceof UserError
    ? error.message
    : '操作未完成，请检查扩展的 Claude 站点访问权限后重试。';
}
