import { CreateProductRequest, Product, UpdateRecipeRequest } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function listProducts(
  _user: AuthenticatedUser,
): Promise<Product[]> {
  // TODO: Query products joined with computed recipes from user.supabaseClient
  throw new NotImplementedError(
    "List products service is not implemented yet.",
  );
}

export async function createProduct(
  _user: AuthenticatedUser,
  _data: CreateProductRequest,
): Promise<Product> {
  // TODO: Insert product into products table via user.supabaseClient
  throw new NotImplementedError(
    "Create product service is not implemented yet.",
  );
}

export async function getProductRecipe(
  _user: AuthenticatedUser,
  _productId: string,
): Promise<Product> {
  // TODO: Query recipe ingredients and costing for product
  throw new NotImplementedError(
    "Get product recipe service is not implemented yet.",
  );
}

export async function updateProductRecipe(
  _user: AuthenticatedUser,
  _productId: string,
  _data: UpdateRecipeRequest,
): Promise<Product> {
  // TODO: Update product_ingredients table and recalculate product_costing
  throw new NotImplementedError(
    "Update product recipe service is not implemented yet.",
  );
}
