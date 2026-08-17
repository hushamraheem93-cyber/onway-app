/**
 * The admin panel's shared StyleSheet (H-65).
 *
 * Moved verbatim out of AdminScreen.tsx — same 94 keys, same values, same order,
 * not one of them retyped. It lives here because the tab components split out of
 * AdminScreen use it: eleven of the fourteen tabs reference it, between three and
 * thirty-one keys each, and 88 of the 94 keys are reached from a tab.
 *
 * Relocating the sheet once is the conservative option. The alternatives were to
 * pass `styles` down as a prop to every tab, or to copy the keys each tab needs
 * into that tab's own file — the second of which would create as many as a dozen
 * divergent copies of the same visual definitions, which is exactly the failure a
 * decomposition is supposed to avoid.
 *
 * `StyleSheet.create` still runs exactly once, at module load, as it did before.
 */
import { StyleSheet } from "react-native";

import {
  Spacing,
  BorderRadius,
  AppColors,
  FontWeight,
} from "@/constants/theme";

export const styles = StyleSheet.create({
  // ── Admin tab bar ─────────────────────────────────────────
  // H-65: moved verbatim to client/screens/admin/AdminTabBar.tsx alongside the
  // markup that used them. Nothing else in this file referenced them.
  // ── Legacy (kept for existing tab content) ────────────────
  tabsScroll: { marginBottom: Spacing.lg, flexGrow: 0 },
  tabs: { flexDirection: "row", gap: Spacing.sm, paddingVertical: Spacing.xs },
  tab: {
    minHeight: 48,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: AppColors.gray100,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  tabActive: { backgroundColor: AppColors.primary },
  tabText: { color: AppColors.gray500, fontSize: 12 },
  tabTextActive: { color: AppColors.white, fontWeight: FontWeight.semiBold },
  formCard: {
    backgroundColor: AppColors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    marginBottom: Spacing.md,
    textAlign: "right",
  },
  fieldLabel: {
    marginBottom: Spacing.xs,
    textAlign: "right",
  },
  input: {
    borderRadius: BorderRadius.lg,
    minHeight: 52,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 16, // ≥16 for readability + prevents iOS auto-zoom on focus
    fontFamily: "Tajawal_400Regular",
    marginBottom: Spacing.md,
    textAlign: "right",
  },
  descInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  priceRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  priceInput: {
    flex: 1,
  },
  switchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  categorySelector: {
    marginBottom: Spacing.md,
  },
  categoryScroll: {
    marginTop: Spacing.xs,
  },
  categoryChip: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: AppColors.gray100,
    marginRight: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChipActive: {
    backgroundColor: AppColors.primary,
  },
  categoryChipText: {
    color: AppColors.gray500,
  },
  categoryChipTextActive: {
    color: AppColors.white,
  },
  typeSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  typeButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: AppColors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  typeButtonActive: {
    backgroundColor: AppColors.primary,
  },
  typeButtonText: {
    color: AppColors.gray500,
  },
  typeButtonTextActive: {
    color: AppColors.white,
  },
  imagePicker: {
    height: 140,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  imagePickerPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  formButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  saveButton: {
    flex: 1,
    backgroundColor: AppColors.primary,
    minHeight: 52,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: AppColors.white,
    fontWeight: FontWeight.bold,
    fontSize: 13,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: AppColors.gray100,
    minHeight: 52,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: AppColors.gray500,
    fontSize: 13,
  },
  listTitle: {
    marginBottom: Spacing.md,
    textAlign: "right",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  listItemImage: {
    width: 60,
    height: 40,
    borderRadius: BorderRadius.sm,
  },
  listItemContent: {
    flex: 1,
    marginHorizontal: Spacing.md,
    alignItems: "flex-end",
  },
  listItemActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  areaIcon: {
    width: 50,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  productPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  discountBadge: {
    backgroundColor: AppColors.error,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  discountText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: FontWeight.semiBold,
  },
  orderCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  trackBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.black,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  statusButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  statusBtn: {
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveCategoryChangesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  saveCategoryChangesBtnText: {
    color: AppColors.white,
    fontWeight: FontWeight.bold,
    fontSize: 12,
  },
  // ── Notifications Tab ──
  notifContainer: {
    gap: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  notifHeader: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: AppColors.primary + "0F",
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(251,91,33,0.15)",
  },
  notifTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: AppColors.primary,
    textAlign: "center",
  },
  notifSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray500,
    textAlign: "center",
  },
  notifCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  notifLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
    marginBottom: Spacing.xs,
  },
  notifInput: {
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: AppColors.gray50,
    color: AppColors.gray800,
  },
  notifTextArea: {
    minHeight: 110,
    paddingTop: Spacing.sm,
  },
  notifSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 4,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  notifSendBtnText: {
    color: AppColors.white,
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
  },
  notifSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.successLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: AppColors.successLight,
  },
  notifSuccessText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: AppColors.success,
    flex: 1,
    textAlign: "right",
  },
  notifErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.errorLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: AppColors.error,
  },
  notifErrorText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.error,
    flex: 1,
    textAlign: "right",
  },
  // ── Users Tab ──
  usersContainer: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  usersStatsCard: {
    flexDirection: "row",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: "center",
  },
  usersStatBox: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  usersStatDivider: {
    width: 1,
    height: 56,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginHorizontal: Spacing.md,
  },
  usersStatNum: {
    fontFamily: "Cairo_700Bold",
    fontSize: 28,
    lineHeight: 38,
    includeFontPadding: true,
    color: AppColors.primary,
  },
  usersStatLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "center",
  },
  usersSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  usersSearchInput: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
    paddingVertical: 0,
  },
  usersRefreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  usersRefreshText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.primary,
  },
  usersList: {
    gap: Spacing.sm,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  userRowLeft: {
    alignItems: "center",
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: AppColors.primary,
  },
  userRowInfo: {
    flex: 1,
    gap: 2,
    alignItems: "flex-end",
  },
  userRowName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  userRowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  userRowPhone: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray500,
  },
  userRowDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: AppColors.gray400,
    textAlign: "right",
  },
  userRowRight: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  userNotifBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: AppColors.successLight,
    alignItems: "center",
    justifyContent: "center",
  },
  userRowIndex: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: AppColors.gray400,
  },
  usersEmpty: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  usersEmptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: AppColors.gray400,
    textAlign: "center",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  modalBox: {
    width: "85%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  driverPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
});
