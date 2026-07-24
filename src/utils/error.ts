import type {
  ServiceError,
  TextTranslateQuery,
  ValidationCompletion,
} from '@bob-translate/types';

export const isServiceError = (value: unknown): value is ServiceError =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'type' in value &&
      typeof value.type === 'string' &&
      'message' in value &&
      typeof value.message === 'string',
  );

const serialize = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
};

export const convertToServiceError = (
  error: unknown,
  defaultMessage = '未知错误',
): ServiceError => {
  if (isServiceError(error)) return error;
  if (error instanceof Error) {
    return {
      type: 'api',
      message: error.message || defaultMessage,
    };
  }
  if (typeof error === 'string') {
    return {
      type: 'unknown',
      message: error || defaultMessage,
    };
  }
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    const message =
      typeof candidate.message === 'string'
        ? candidate.message
        : typeof candidate.localizedDescription === 'string'
          ? candidate.localizedDescription
          : '';
    if (message) {
      return {
        type: 'unknown',
        message,
        addition: serialize(error),
      };
    }
  }
  return {
    type: 'unknown',
    message: defaultMessage,
    addition: serialize(error),
  };
};

export const handleGeneralError = (
  query: TextTranslateQuery,
  error: unknown,
): void => {
  query.onCompletion({
    error: convertToServiceError(error),
  });
};

export const handleValidateError = (
  completion: ValidationCompletion,
  error: unknown,
): void => {
  completion({
    result: false,
    error: convertToServiceError(error),
  });
};
