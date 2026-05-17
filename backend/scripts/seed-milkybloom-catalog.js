const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');

const seedMilkyBloomCatalog = async () => {
  try {
    // Connect to MongoDB (use Docker local instance for development)
    const mongoUri = process.env.NODE_ENV === 'production'
      ? process.env.MONGODB_URI
      : 'mongodb://admin:admin123@localhost:27017/toy_store?authSource=admin';

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ Connected to MongoDB');

    // Read category data
    const categoriesPath = path.join(__dirname, '../data/milkybloom-categories.json');
    const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
    console.log(`✓ Read ${categoriesData.length} categories from file`);

    // Read product data
    const productsPath = path.join(__dirname, '../data/milkybloom-products.json');
    const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
    console.log(`✓ Read ${productsData.length} products from file`);

    // Clear existing data (optional - only if auth is available)
    try {
      await Category.deleteMany({});
      await Product.deleteMany({});
      console.log('✓ Cleared existing categories and products');
    } catch (clearError) {
      console.log('⚠ Skipped clearing (auth required, proceeding with insert)');
    }

    // Insert categories
    const insertedCategories = await Category.insertMany(categoriesData);
    console.log(`✓ Inserted ${insertedCategories.length} categories`);

    // Insert products with category references
    const productsWithCategoryIds = productsData.map(product => {
      // Find matching category by slug
      const category = insertedCategories.find(cat =>
        cat.slug === product.category.toLowerCase().replace(/\s+/g, '-')
      );

      return {
        name: product.title,
        slug: product.id, // Use product ID as slug
        categoryId: [category._id], // Array of ObjectId
        description: product.description,
        minPrice: product.price,
        maxPrice: product.originalPrice,
        totalStock: product.stock,
        imageUrls: product.images,
        averageRating: product.rating,
        status: 'Published',
        isFeatured: product.featured !== undefined ? product.featured : false,
        totalUnitsSold: product.sold,
        variants: [], // Empty for now - variants would need separate Variant documents
        attributes: product.colors ? [{
          name: 'Color',
          values: product.colors
        }] : [],
      };
    });

    const insertedProducts = await Product.insertMany(productsWithCategoryIds);
    console.log(`✓ Inserted ${insertedProducts.length} products`);

    // Print summary
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   MilkyBloom Catalog Seeded Successfully   ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log(`\n📊 Summary:`);
    console.log(`   • Categories: ${insertedCategories.length}`);
    console.log(`   • Products: ${insertedProducts.length}`);
    console.log(`   • Total SKUs: ${productsWithCategoryIds.reduce((sum, p) => sum + (p.variants?.length || 1), 0)}`);

    // Print categories
    console.log(`\n📁 Categories:`);
    categoriesData.forEach(cat => {
      console.log(`   ✓ ${cat.icon} ${cat.name} (${cat.productCount} items)`);
    });

    // Print featured products
    console.log(`\n⭐ Featured Products:`);
    const featuredProducts = productsData.slice(0, 3);
    featuredProducts.forEach(prod => {
      console.log(`   ✓ ${prod.title} - ₫${(prod.price).toLocaleString()}`);
    });

    console.log('\n✨ Ready for production!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedMilkyBloomCatalog();
