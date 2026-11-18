import { USE_MOCKS } from "@/lib/use-mocks";
import * as mock from "./mock";
import * as real from "./api";

const impl = USE_MOCKS ? mock : real;

export const signIn = impl.signIn;
export const signOut = impl.signOut;
export const getSession = impl.getSession;
export const requestPasswordRecovery = impl.requestPasswordRecovery;
export const verifyRecoveryCode = impl.verifyRecoveryCode;
export const resetPassword = impl.resetPassword;
export const registerOwner = impl.registerOwner;
export type { RegisterOwnerRequest } from "./mock";
