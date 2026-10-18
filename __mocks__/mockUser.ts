export const createMockUser = (
  overrides?: Partial<LoggedInUser>,
): LoggedInUser => ({
  email: "test@example.com",
  name: "Test User",
  id: 1,
  userTrackGroupPurchases: [],
  userTrackPurchases: [],
  artists: [],
  artistUserSubscriptions: [],
  currency: "USD",
  ...overrides,
});
