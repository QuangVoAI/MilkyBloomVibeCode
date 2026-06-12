const bsonObjectIdToString = (value) => {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '[object Object]' ? '' : trimmed;
  }

  if (typeof value === 'object') {
    if (typeof value.$oid === 'string') return value.$oid;

    if (
      value.buffer &&
      value.buffer.type === 'Buffer' &&
      Array.isArray(value.buffer.data) &&
      value.buffer.data.length === 12
    ) {
      return value.buffer.data
        .map((byte) => Number(byte).toString(16).padStart(2, '0'))
        .join('');
    }
  }

  return '';
};

export const getProductRouteId = (productOrId) => {
  if (!productOrId) return '';

  if (typeof productOrId === 'string') {
    const trimmed = productOrId.trim();
    return trimmed === '[object Object]' ? '' : trimmed;
  }

  if (typeof productOrId === 'object') {
    const slug =
      typeof productOrId.slug === 'string' && productOrId.slug.trim()
        ? productOrId.slug.trim()
        : '';
    if (slug) return slug;

    return (
      bsonObjectIdToString(productOrId._id) ||
      bsonObjectIdToString(productOrId.id)
    );
  }

  return String(productOrId);
};

export const buildProductPath = (productOrId) => {
  const routeId = getProductRouteId(productOrId);
  return routeId ? `/products/${routeId}` : '/products';
};
