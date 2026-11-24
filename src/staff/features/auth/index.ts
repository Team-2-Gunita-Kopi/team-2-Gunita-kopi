import { USE_MOCKS } from "@/staff/lib/use-mocks";
import * as mock from "./mock";
import * as real from "./api";

const impl = USE_MOCKS ? mock : real;

export const signIn = impl.signIn;
export const signOut = impl.signOut;
export const getSession = impl.getSession;
