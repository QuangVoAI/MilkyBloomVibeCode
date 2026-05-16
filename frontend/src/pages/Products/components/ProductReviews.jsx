import React, { useState } from 'react';
import { Star, ThumbsUp, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import Badge from '@/components/ui/badge';
import './ProductReviews.css';

const ProductReviews = ({ rating = 0, reviewCount = 0 }) => {
  const [reviews] = useState([
    // Mock reviews - in real app, fetch from API
    {
      id: 1,
      userName: 'John Doe',
      rating: 5,
      date: '2024-10-15',
      comment: 'Amazing product! Exactly what I was looking for. The quality is outstanding and it arrived quickly. Highly recommend!',
      helpful: 12,
      verified: true,
    },
    {
      id: 2,
      userName: 'Jane Smith',
      rating: 4,
      date: '2024-10-10',
      comment: 'Very good product. The only minor issue is the packaging could be better, but the product itself is great.',
      helpful: 8,
      verified: true,
    },
    {
      id: 3,
      userName: 'Mike Johnson',
      rating: 5,
      date: '2024-10-05',
      comment: 'Exceeded my expectations! Great value for money. The attention to detail is impressive.',
      helpful: 15,
      verified: false,
    },
  ]);

  const [showAll, setShowAll] = useState(false);
  const displayedReviews = showAll ? reviews : reviews.slice(0, 3);

  // Calculate rating distribution
  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter(r => r.rating === star).length;
    const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
    return { star, count, percentage };
  });

  const handleWriteReview = () => {
    // TODO: Implement write review functionality
  };

  return (
    <div className="product-reviews-section">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Customer Reviews</span>
            <Button onClick={handleWriteReview}>Write a Review</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Rating Summary */}
          <div className="rating-summary">
            <div className="rating-overview">
              <div className="overall-rating">
                <span className="rating-number">{rating.toFixed(1)}</span>
                <div className="rating-stars-large">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={24}
                      fill={i < Math.floor(rating) ? '#fbbf24' : 'none'}
                      stroke={i < Math.floor(rating) ? '#fbbf24' : '#d1d5db'}
                    />
                  ))}
                </div>
                <span className="rating-count">{reviewCount} reviews</span>
              </div>

              <div className="rating-distribution">
                {ratingDistribution.map(({ star, count, percentage }) => (
                  <div key={star} className="distribution-row">
                    <span className="star-label">{star} star</span>
                    <div className="distribution-bar">
                      <div
                        className="distribution-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="distribution-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Reviews List */}
          <div className="reviews-list">
            {displayedReviews.length > 0 ? (
              <>
                {displayedReviews.map((review) => (
                  <div key={review.id} className="review-item">
                    <div className="review-header">
                      <div className="review-author">
                        <div className="author-avatar">
                          {review.userName.charAt(0).toUpperCase()}
                        </div>
                        <div className="author-info">
                          <div className="author-name">
                            {review.userName}
                            {review.verified && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                Verified Purchase
                              </Badge>
                            )}
                          </div>
                          <div className="review-date">
                            {new Date(review.date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="review-rating">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={16}
                            fill={i < review.rating ? '#fbbf24' : 'none'}
                            stroke={i < review.rating ? '#fbbf24' : '#d1d5db'}
                          />
                        ))}
                      </div>
                    </div>

                    <p className="review-comment">{review.comment}</p>

                    <div className="review-actions">
                      <Button variant="ghost" size="sm" className="action-btn">
                        <ThumbsUp size={14} className="mr-1" />
                        Helpful ({review.helpful})
                      </Button>
                      <Button variant="ghost" size="sm" className="action-btn">
                        <MessageCircle size={14} className="mr-1" />
                        Reply
                      </Button>
                    </div>

                    <Separator className="my-4" />
                  </div>
                ))}

                {reviews.length > 3 && (
                  <div className="text-center">
                    <Button
                      variant="outline"
                      onClick={() => setShowAll(!showAll)}
                    >
                      {showAll ? 'Show Less' : `Show All ${reviews.length} Reviews`}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="no-reviews">
                <p className="text-muted-foreground">No reviews yet. Be the first to review this product!</p>
                <Button onClick={handleWriteReview} className="mt-4">
                  Write the First Review
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductReviews;
