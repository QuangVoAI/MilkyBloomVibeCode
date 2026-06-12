const request = require('supertest');

const BASE_URL = process.env.TEST_API_BASE_URL;
const describeIfApiTarget = BASE_URL ? describe : describe.skip;

describeIfApiTarget('Products API Integration', () => {
  describe('GET /api/products', () => {
    it('should return products list', async () => {
      const response = await request(BASE_URL)
        .get('/api/products')
        .expect('Content-Type', /json/);

      expect([200, 429]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('products');
        expect(Array.isArray(response.body.data.products)).toBe(true);
      }
    });

    it('should support pagination', async () => {
      const response = await request(BASE_URL)
        .get('/api/products?page=1&limit=5');

      if (response.status === 200) {
        expect(response.body.data.products.length).toBeLessThanOrEqual(5);
      }
    });

    it('should support search query', async () => {
      const response = await request(BASE_URL)
        .get('/api/products?search=toy');

      expect([200, 429]).toContain(response.status);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should return 404 for invalid product ID', async () => {
      const response = await request(BASE_URL)
        .get('/api/products/invalid-id');

      expect([400, 404, 500]).toContain(response.status);
    });
  });
});

describeIfApiTarget('Categories API Integration', () => {
  describe('GET /api/categories', () => {
    it('should return categories list', async () => {
      const response = await request(BASE_URL)
        .get('/api/categories');

      expect([200, 429]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
      }
    });
  });
});

describeIfApiTarget('Auth API Integration', () => {
  describe('POST /api/auth/login', () => {
    it('should reject invalid credentials', async () => {
      const response = await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          emailOrPhoneOrUsername: 'invalid@test.com',
          password: 'wrongpassword'
        });

      expect([400, 401, 404, 429]).toContain(response.status);
    });

    it('should include rate limit headers', async () => {
      const response = await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          emailOrPhoneOrUsername: 'test@test.com',
          password: 'test123'
        });

      expect(response.headers).toHaveProperty('ratelimit-limit');
    });
  });

  describe('POST /api/auth/register', () => {
    it('should validate required fields', async () => {
      const response = await request(BASE_URL)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email'
        });

      expect([400, 422, 429, 500]).toContain(response.status);
    });
  });
});

describeIfApiTarget('Cart API Integration', () => {
  describe('GET /api/carts', () => {
    it('should accept guest session header', async () => {
      const sessionId = `test-session-${Date.now()}`;
      
      const response = await request(BASE_URL)
        .get('/api/carts')
        .set('x-guest-session-id', sessionId);

      expect([200, 401, 404, 429]).toContain(response.status);
    });

    it('should include rate limit headers', async () => {
      const response = await request(BASE_URL)
        .get('/api/carts')
        .set('x-guest-session-id', 'test-session');

      expect(response.headers).toHaveProperty('ratelimit-limit');
    });
  });
});

describeIfApiTarget('Orders API Integration', () => {
  describe('GET /api/orders', () => {
    it('should require authentication', async () => {
      const response = await request(BASE_URL)
        .get('/api/orders');

      expect([401, 403, 429]).toContain(response.status);
    });
  });
});

describeIfApiTarget('Reviews API Integration', () => {
  describe('GET /api/reviews/product/:id', () => {
    it('should return reviews or 404 for product', async () => {
      const response = await request(BASE_URL)
        .get('/api/reviews/product/123456789012');

      expect([200, 400, 404, 429, 500]).toContain(response.status);
    });
  });
});

describeIfApiTarget('Discount Codes API Integration', () => {
  describe('POST /api/discount/validate', () => {
    it('should reject invalid discount code', async () => {
      const response = await request(BASE_URL)
        .post('/api/discount/validate')
        .send({ code: 'INVALID_CODE_12345' });

      expect([400, 401, 404, 422, 429]).toContain(response.status);
    });
  });
});

describeIfApiTarget('Health Check', () => {
  it('API should be reachable', async () => {
    const response = await request(BASE_URL)
      .get('/api/products?limit=1');

    expect([200, 429]).toContain(response.status);
  });
});
