import { defineRecipe } from "@pandacss/dev";

export const button = defineRecipe({
    className: "btn",
    base: {
        color: "{colors.bg.text}",
        bg: ".50",
        bgColor: "bg.muted",
    },
    variants: {
        size: {
            sm: {
                fontSize: "3xl",
                borderRadius: "{radii.xl}",
                padding: 2,
            },
            md: {
                fontSize: "4xl",
                borderRadius: "{radii.2xl}",
                padding: 2,
            },
            
        }
    }
})