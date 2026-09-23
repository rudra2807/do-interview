import * as flagRepository from "../repositories/flagRepository";
import { CreateFlagInput, UpdateFlagInput } from "../validation/flagSchemas";

export function createFlag(input: CreateFlagInput) {
  return flagRepository.createFlag(input);
}

export function listFlags() {
  return flagRepository.listFlags();
}

export function updateFlag(key: string, input: UpdateFlagInput) {
  return flagRepository.updateFlag(key, input);
}

export function deleteFlag(key: string) {
  return flagRepository.deleteFlag(key);
}
