require('dotenv').config({ path: 'backend/.env' });
const mongoose = require('mongoose');
const { getAllProducts } = require('./backend/src/services/product.service.js');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await getAllProducts({ maxPrice: '500000', limit: '5', sort: 'price-asc' });
    console.log(result.products.map(p => ({ name: p.name, minPrice: p.minPrice, maxPrice: p.maxPrice })));
    await mongoose.disconnect();
}
run().catch(console.error);
