import apiClient, { API_BASE_URL } from './config';

/**
 * Get reviews for a product
 * @param {string} productId - Product ID
 * @param {Object} params - Query parameters (page, limit, sort, rating)
 * @returns {Promise<Object>} - Reviews data with pagination
 */
export const getProductReviews = async (productId, params = {}) => {
  const response = await apiClient.get(`/reviews/product/${productId}`, { params });
  return response;
};

/**
 * Create a new star rating for a product
 * Reviews are now just star ratings - no text or images
 * @param {Object} reviewData - Review data { productId, rating }
 * @returns {Promise<Object>} - Created review with populated user data
 */
export const createReview = async (reviewData) => {
  // Validate required fields
  if (!reviewData.productId) {
    throw new Error('Product ID is required');
  }
  if (!reviewData.rating || reviewData.rating < 1 || reviewData.rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  // Reviews are now just star ratings - send simple JSON
  const response = await apiClient.post('/reviews', {
    productId: reviewData.productId,
    rating: reviewData.rating,
  });
  return response;
};

/**
 * Check if user can review a product
 * Any authenticated user can review once per product (no purchase required)
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} - { canReview: boolean, hasReviewed: boolean }
 */
export const checkReviewEligibility = async (productId) => {
  const response = await apiClient.get(`/reviews/eligibility/${productId}`);
  return response.metadata;
};

/**
 * Update a review
 * @param {string} reviewId - Review ID
 * @param {Object} reviewData - Updated review data { rating }
 * @returns {Promise<Object>} - Updated review with populated user data
 */
export const updateReview = async (reviewId, reviewData) => {
  if (reviewData.rating && (reviewData.rating < 1 || reviewData.rating > 5)) {
    throw new Error('Rating must be between 1 and 5');
  }

  const response = await apiClient.patch(`/reviews/${reviewId}`, {
    rating: reviewData.rating,
    comment: reviewData.comment?.trim(),
  });
  return response;
};

/**
 * Delete a review
 * @param {string} reviewId - Review ID
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteReview = async (reviewId) => {
  const response = await apiClient.delete(`/reviews/${reviewId}`);
  return response;
};

/**
 * Toggle helpful/like status for a review
 * @param {string} reviewId - Review ID
 * @returns {Promise<Object>} - { helpfulCount, isHelpful }
 */
export const toggleReviewHelpful = async (reviewId) => {
  const response = await apiClient.post(`/reviews/${reviewId}/helpful`);
  return response;
};

/**
 * Get review count for a product
 * @param {string} productId - Product ID
 * @returns {Promise<number>} - Number of reviews
 */
export const getReviewCount = async (productId) => {
  try {
    const result = await getProductReviews(productId, { limit: 1, page: 1 });
    return result.metadata?.total || 0;
  } catch (error) {
    console.error('Error getting review count:', error);
    return 0;
  }
};

/**
 * Check if user has reviewed a product
 * @param {string} productId - Product ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user has reviewed the product
 */
export const hasUserReviewedProduct = async (productId, userId) => {
  try {
    const result = await getProductReviews(productId);
    const reviews = result.metadata?.reviews || [];
    return reviews.some(review => review.userId?._id === userId || review.userId === userId);
  } catch (error) {
    console.error('Error checking user review:', error);
    return false;
  }
};

/**
 * Get review statistics for a product
 * Uses lightweight backend aggregation instead of fetching all reviews
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} - Review statistics (total, averageRating, distribution)
 */
export const getReviewStats = async (productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/stats/${productId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch review stats');
    }
    
    const result = await response.json();
    return {
      total: result.data?.total || 0,
      count: result.data?.total || 0,
      averageRating: result.data?.averageRating || 0,
      distribution: result.data?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  } catch (error) {
    console.error('Error getting review stats:', error);
    return {
      total: 0,
      count: 0,
      averageRating: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
};
