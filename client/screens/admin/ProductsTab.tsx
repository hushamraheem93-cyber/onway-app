/**
 * The admin "المنتجات" (platform products) tab (H-65).
 *
 * `renderProductsTab` moved verbatim out of AdminScreen. It is the heaviest user
 * of the shared StyleSheet — 31 of its 94 keys — which is why that sheet was moved
 * to client/screens/admin/adminStyles.ts and imported rather than copied here.
 *
 * The `inStock` switch keeps the exact meaning H-64 settled on, and pricing fields
 * are still plain inputs: no discount or fee maths happens in this file.
 */
import React from "react";
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { AppColors, FontWeight } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { resolveImageUrl } from "@/utils/imageUtils";
import { styles } from "@/screens/admin/adminStyles";

interface ProductForm {
  name: string;
  categoryId: string;
  price: string;
  originalPrice: string;
  discount: string;
  description: string;
  inStock: boolean;
  imageUri: string;
  imageUrl: string;
  restaurant: string;
}

interface Props {
  products: any[];
  productsLoading: boolean;
  categories: any[];
  productForm: ProductForm;
  setProductForm: React.Dispatch<React.SetStateAction<ProductForm>>;
  saveProduct: () => void;
  isSavingProduct: boolean;
  handleEditProduct: (product: any) => void;
  confirmDelete: (id: string, type: "product") => void;
  pickImage: (setter: (uri: string) => void) => void;
  isEditing: boolean;
  editItem: any;
  resetForm: () => void;
  theme: any;
}

function ProductsTabInner({
  products,
  productsLoading,
  categories,
  productForm,
  setProductForm,
  saveProduct,
  isSavingProduct,
  handleEditProduct,
  confirmDelete,
  pickImage,
  isEditing,
  editItem,
  resetForm,
  theme,
}: Props) {
  const renderProductsTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل المنتج" : "إضافة منتج جديد"}
        </ThemedText>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder="اسم المنتج"
          placeholderTextColor={theme.textSecondary}
          value={productForm.name}
          onChangeText={(text) =>
            setProductForm({ ...productForm, name: text })
          }
        />

        <View style={styles.categorySelector}>
          <ThemedText
            type="small"
            style={[styles.fieldLabel, { color: theme.textSecondary }]}
          >
            القسم:
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
          >
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                style={[
                  styles.categoryChip,
                  productForm.categoryId === cat.id &&
                    styles.categoryChipActive,
                ]}
                onPress={() =>
                  setProductForm({ ...productForm, categoryId: cat.id })
                }
              >
                <ThemedText
                  type="small"
                  style={[
                    styles.categoryChipText,
                    productForm.categoryId === cat.id &&
                      styles.categoryChipTextActive,
                  ]}
                >
                  {cat.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {productForm.categoryId === "restaurants" ? (
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundSecondary, color: theme.text },
            ]}
            placeholder="اسم المطعم (مثال: يلا ايت)"
            placeholderTextColor={theme.textSecondary}
            value={productForm.restaurant}
            onChangeText={(text) =>
              setProductForm({ ...productForm, restaurant: text })
            }
          />
        ) : null}

        <View style={styles.priceRow}>
          <TextInput
            style={[
              styles.input,
              styles.priceInput,
              { backgroundColor: theme.backgroundSecondary, color: theme.text },
            ]}
            placeholder="السعر (د.ع)"
            placeholderTextColor={theme.textSecondary}
            value={productForm.price}
            onChangeText={(text) =>
              setProductForm({ ...productForm, price: text })
            }
            keyboardType="numeric"
          />
          <TextInput
            style={[
              styles.input,
              styles.priceInput,
              { backgroundColor: theme.backgroundSecondary, color: theme.text },
            ]}
            placeholder="السعر الأصلي (اختياري)"
            placeholderTextColor={theme.textSecondary}
            value={productForm.originalPrice}
            onChangeText={(text) =>
              setProductForm({ ...productForm, originalPrice: text })
            }
            keyboardType="numeric"
          />
        </View>

        <View style={styles.priceRow}>
          <TextInput
            style={[
              styles.input,
              styles.priceInput,
              { backgroundColor: theme.backgroundSecondary, color: theme.text },
            ]}
            placeholder="نسبة الخصم % (اختياري)"
            placeholderTextColor={theme.textSecondary}
            value={productForm.discount}
            onChangeText={(text) =>
              setProductForm({ ...productForm, discount: text })
            }
            keyboardType="numeric"
          />
          <View
            style={[
              styles.switchContainer,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              متوفر
            </ThemedText>
            <Switch
              value={productForm.inStock}
              onValueChange={(value) =>
                setProductForm({ ...productForm, inStock: value })
              }
              trackColor={{ false: AppColors.gray300, true: AppColors.primary }}
              thumbColor={AppColors.white}
            />
          </View>
        </View>

        <TextInput
          style={[
            styles.input,
            styles.descInput,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder="وصف المنتج"
          placeholderTextColor={theme.textSecondary}
          value={productForm.description}
          onChangeText={(text) =>
            setProductForm({ ...productForm, description: text })
          }
          multiline
          numberOfLines={3}
        />

        <Pressable
          style={[styles.imagePicker, { borderColor: theme.border }]}
          onPress={() =>
            pickImage((uri) =>
              setProductForm({ ...productForm, imageUri: uri, imageUrl: "" }),
            )
          }
        >
          {productForm.imageUri || productForm.imageUrl ? (
            <Image
              source={{
                uri:
                  productForm.imageUri || resolveImageUrl(productForm.imageUrl),
              }}
              style={styles.previewImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Feather name="image" size={32} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                اختر صورة المنتج
              </ThemedText>
            </View>
          )}
        </Pressable>

        <View style={styles.formButtons}>
          {isEditing ? (
            <Pressable style={styles.cancelButton} onPress={resetForm}>
              <ThemedText type="body" style={styles.cancelButtonText}>
                إلغاء
              </ThemedText>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.saveButton, isSavingProduct && { opacity: 0.7 }]}
            onPress={saveProduct}
            disabled={isSavingProduct}
          >
            {isSavingProduct ? (
              <ActivityIndicator color={AppColors.white} size="small" />
            ) : (
              <ThemedText type="body" style={styles.saveButtonText}>
                {editItem ? "حفظ التعديلات" : "إضافة"}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>
        المنتجات الحالية ({products.length})
      </ThemedText>

      {productsLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        products.map((product) => (
          <View
            key={product.id}
            style={[
              styles.listItem,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Image
              source={{ uri: resolveImageUrl(product.image) }}
              style={styles.listItemImage}
              contentFit="cover"
            />
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>
                {product.name}
              </ThemedText>
              <View style={styles.productPriceRow}>
                <ThemedText
                  type="small"
                  style={{
                    color: AppColors.primary,
                    fontWeight: FontWeight.semiBold,
                  }}
                >
                  {formatPrice(product.price)}
                </ThemedText>
                {(product as any).restaurant ? (
                  <View
                    style={[
                      styles.discountBadge,
                      { backgroundColor: "#FB5B2120" },
                    ]}
                  >
                    <ThemedText
                      type="small"
                      style={{
                        color: AppColors.primary,
                        fontWeight: FontWeight.semiBold,
                        fontSize: 10,
                      }}
                    >
                      {(product as any).restaurant}
                    </ThemedText>
                  </View>
                ) : null}
                {product.discount ? (
                  <View style={styles.discountBadge}>
                    <ThemedText type="small" style={styles.discountText}>
                      -{product.discount}%
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.listItemActions}>
              <Pressable
                onPress={() => handleEditProduct(product)}
                style={styles.actionButton}
              >
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(product.id, "product")}
                style={styles.actionButton}
              >
                <Feather name="trash-2" size={18} color={AppColors.error} />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  return renderProductsTab();
}

export const ProductsTab = React.memo(ProductsTabInner);
