export const Relevance = Object.freeze({
    MENTIONED: "Mentioned",
    RELATED: "Related",
    RELEVANT: "Relevant"
});

export function scoreToRelevance(score) {
    if (score < 5) {
        return Relevance.MENTIONED;
    } else if (score < 15) {
        return Relevance.RELATED;
    } else {
        return Relevance.RELEVANT;
    }
}