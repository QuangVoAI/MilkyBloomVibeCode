const variantRepository = require('../repositories/variant.repository');
const productRepository = require('../repositories/product.repository');
const { storeImages, removeImages } = require('../utils/image-storage');

const updateProductPriceRange = async (productId) => {
    const variants = await variantRepository.findByProductId(productId);

    if (!variants.length) {
        await productRepository.updatePriceRange(productId, 0, 0);
        return;
    }

    const prices = variants.map((v) => v.price || 0);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    await productRepository.updatePriceRange(productId, min, max);
};

const getVariantsByProduct = async (productId) => {
    return await variantRepository.findByProductId(productId);
};

const getVariantById = async (id) => {
    const variant = await variantRepository.findById(id);
    if (!variant) {
        throw new Error('Variant not found');
    }
    return variant;
};

const createVariant = async (productId, variantData, imgFiles) => {
    const product = await productRepository.findById(productId);
    if (!product) {
        throw new Error('Product not found');
    }

    const allowedAttributes = product.attributes;

    let variantAttributesArray;
    if (typeof variantData.attributes === "string") {
        try {
            variantAttributesArray = JSON.parse(variantData.attributes);
        } catch (e) {
            throw new Error(
                "Invalid attributes JSON format. Please send an array.",
            );
        }
    } else {
        variantAttributesArray = variantData.attributes;
    }

    for (const variantAttr of variantAttributesArray) {
        const definition = allowedAttributes.find(
            (attr) => attr.name === variantAttr.name,
        );

        if (!definition) {
            allowedAttributes.push({
                name: variantAttr.name,
                values: [variantAttr.value],
            });
        } else {
            if (!definition.values.includes(variantAttr.value)) {
                definition.values.push(variantAttr.value);
            }
        }
    }

    let imageUrls = [];
    if (imgFiles && imgFiles.length > 0) {
        imageUrls = await storeImages(imgFiles, 'variantImages');
    }

    const newVariant = {
        ...variantData,
        attributes: variantAttributesArray,
        imageUrls: imageUrls,
        productId: productId,
    };

    const createdVariant = await variantRepository.create(newVariant);

    product.variants.push(createdVariant._id);

    await product.save();

    await updateProductPriceRange(productId);

    return createdVariant;
};

const updateVariant = async (id, data) => {
    const updated = await variantRepository.update(id, data);
    if (!updated) throw new Error('Variant not found');

    await updateProductPriceRange(updated.productId);
    return updated;
};

const deleteVariant = async (id) => {
    const variant = await variantRepository.findById(id);
    if (!variant) throw new Error('Variant not found');

    if (variant.imageUrls?.length) {
        await removeImages(variant.imageUrls);
    }

    await variantRepository.deleteById(id);

    await productRepository.update(variant.productId, {
        $pull: { variants: variant._id },
    });

    await updateProductPriceRange(variant.productId);

    return { message: 'Variant deleted successfully' };
};

const addVariantImages = async (id, files) => {
    const uploadedUrls = await storeImages(files, 'variantImages');

    const updated = await variantRepository.update(id, {
        $push: { imageUrls: { $each: uploadedUrls } },
    });

    if (!updated) throw new Error('Variant not found');
    return updated;
};

const removeVariantImages = async (id, urlsToRemove) => {
    await removeImages(urlsToRemove);

    const updated = await variantRepository.update(id, {
        $pull: { imageUrls: { $in: urlsToRemove } },
    });

    if (!updated) throw new Error('Variant not found');
    return updated;
};

module.exports = {
    getVariantsByProduct,
    getVariantById,
    createVariant,
    updateVariant,
    deleteVariant,
    addVariantImages,
    removeVariantImages,
};
