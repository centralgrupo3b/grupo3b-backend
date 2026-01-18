const mongoose = require('mongoose');
const Branch = require('./src/models/Branch.js');
const Product = require('./src/models/Product.js');

async function migrateBranchPrices() {
  try {
    await mongoose.connect('mongodb://localhost:27017/grupo3b', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Conectado a MongoDB');

    // Obtener todas las sucursales
    const branches = await Branch.find();
    console.log(`Encontradas ${branches.length} sucursales`);

    // Obtener todos los productos
    const products = await Product.find();
    console.log(`Encontrados ${products.length} productos`);

    for (const branch of branches) {
      console.log(`Procesando sucursal: ${branch.name}`);

      // Establecer tasa de conversión (ejemplo: 1500 ARS/USD)
      branch.exchangeRate = 1500;

      // Crear precios para cada producto en esta sucursal
      const productPrices = products.map(product => ({
        productId: product._id,
        profitMargin: 20, // 20% de ganancia
        finalPrice: Math.round(product.price * 1500 * 1.2) // precio_base * tasa * (1 + margen/100)
      }));

      branch.productPrices = productPrices;

      await branch.save();
      console.log(`Actualizada sucursal ${branch.name} con ${productPrices.length} precios`);
    }

    console.log('Migración completada exitosamente');
    process.exit(0);

  } catch (error) {
    console.error('Error en migración:', error);
    process.exit(1);
  }
}

migrateBranchPrices();