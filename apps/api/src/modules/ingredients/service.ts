import { CreateIngredientRequest, Ingredient } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function listIngredients(
  _user: AuthenticatedUser,
): Promise<Ingredient[]> {
  // TODO: Query ingredients from user.supabaseClient
  throw new NotImplementedError(
    "List ingredients service is not implemented yet.",
  );
}

export async function createIngredient(
  _user: AuthenticatedUser,
  _data: CreateIngredientRequest,
): Promise<Ingredient> {
  // TODO: Insert into ingredients table via user.supabaseClient
  throw new NotImplementedError(
    "Create ingredient service is not implemented yet.",
  );
}
