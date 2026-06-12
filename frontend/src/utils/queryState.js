export const readQueryString = (searchParams, key, fallback = '') => {
  const value = searchParams.get(key);
  return value == null ? fallback : value;
};

export const readQueryPositiveInt = (searchParams, key, fallback) => {
  const raw = searchParams.get(key);
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const updateQueryParams = (currentSearchParams, entries) => {
  const next = new URLSearchParams(currentSearchParams);

  entries.forEach(({ key, value, defaultValue = '' }) => {
    const normalizedValue = value == null ? '' : String(value);
    const normalizedDefault = defaultValue == null ? '' : String(defaultValue);

    if (normalizedValue === '' || normalizedValue === normalizedDefault) {
      next.delete(key);
      return;
    }

    next.set(key, normalizedValue);
  });

  return next;
};
