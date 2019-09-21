export const Length = Object.freeze({
  SHORT: "short",
  MEDIUM: "medium",
  LONG: "long"
});

export function timeToLength(minutes) {
  if (minutes < 10) {
    return Length.SHORT;
  } else if (minutes < 20) {
    return Length.MEDIUM;
  } else {
    return Length.LONG;
  }
}
