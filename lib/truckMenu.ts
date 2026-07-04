export const MENU_BOARD_IMAGE_PREFIX = 'menu-board:';

export const getMenuBoardImageFromMenuImages = (menuImages?: string[] | null): string | null => {
  if (!Array.isArray(menuImages)) return null;

  const menuBoardEntry = menuImages.find((image): image is string =>
    typeof image === 'string' && image.startsWith(MENU_BOARD_IMAGE_PREFIX)
  );

  if (!menuBoardEntry) return null;
  return menuBoardEntry.replace(MENU_BOARD_IMAGE_PREFIX, '');
};

export const buildMenuImagesWithMenuBoard = (
  existingMenuImages?: string[] | null,
  menuBoardImageUrl?: string | null
): string[] => {
  const sanitizedExisting = (Array.isArray(existingMenuImages) ? existingMenuImages : []).filter(
    (image): image is string => typeof image === 'string' && image.trim().length > 0
  );

  const remainingImages = sanitizedExisting.filter(
    (image) => !image.startsWith(MENU_BOARD_IMAGE_PREFIX)
  );

  const trimmedBoardImageUrl = menuBoardImageUrl?.trim();
  if (!trimmedBoardImageUrl) return remainingImages;

  return [`${MENU_BOARD_IMAGE_PREFIX}${trimmedBoardImageUrl}`, ...remainingImages];
};
