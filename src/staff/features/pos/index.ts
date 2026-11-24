import { USE_MOCKS } from "@/staff/lib/use-mocks";
import * as mock from "./mock";
import * as api from "./api";
import type { PosData } from "./types";

export type { PosCatalog, PosData } from "./types";
export const posData: PosData = USE_MOCKS ? mock.data : api.data;
