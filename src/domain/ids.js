/** Short, collision-resistant local ids for plan items (e.g. "t_3f9a1c2b"). */
export const uid = (prefix) => {
  const rand = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return prefix + "_" + rand;
};
