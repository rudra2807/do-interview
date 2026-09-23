import * as flagRepository from "../repositories/flagRepository";
import { CreateFlagInput } from "../validation/flagSchemas";

export function createFlag(input: CreateFlagInput) {
  return flagRepository.createFlag(input);
}

export function listFlags() {
  return flagRepository.listFlags();
}
