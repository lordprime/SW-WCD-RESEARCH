#!/usr/bin/env Rscript

# Power Analysis for SW-WCD Research
# Calculates required sample sizes for statistical significance

# Load required packages
if (!require(pwr)) install.packages("pwr", repos="http://cran.r-project.org")
if (!require(ggplot2)) install.packages("ggplot2", repos="http://cran.r-project.org")

library(pwr)
library(ggplot2)

# Function to calculate required sample size
calculate_sample_size <- function(effect_size, power = 0.80, alpha = 0.05, df = 1) {
  result <- pwr.chisq.test(
    w = effect_size,
    N = NULL,
    df = df,
    sig.level = alpha,
    power = power
  )
  return(ceiling(result$N))
}

# Function to calculate power for given sample size
calculate_power <- function(effect_size, sample_size, alpha = 0.05, df = 1) {
  result <- pwr.chisq.test(
    w = effect_size,
    N = sample_size,
    df = df,
    sig.level = alpha,
    power = NULL
  )
  return(result$power)
}

# Effect sizes (Cohen's w)
# Small: 0.1, Medium: 0.3, Large: 0.5
effect_sizes <- c(0.1, 0.2, 0.3, 0.4, 0.5)
sample_sizes <- sapply(effect_sizes, calculate_sample_size)

# Create results data frame
power_analysis <- data.frame(
  effect_size = effect_sizes,
  sample_size = sample_sizes,
  effect_category = c("Small", "Small-Medium", "Medium", "Medium-Large", "Large")
)

print("Power Analysis Results:")
print(power_analysis)

# Create visualization
p <- ggplot(power_analysis, aes(x = effect_size, y = sample_size, fill = effect_category)) +
  geom_bar(stat = "identity", alpha = 0.8) +
  geom_text(aes(label = sample_size), vjust = -0.5, size = 3) +
  labs(
    title = "Required Sample Size for Chi-Square Test (Power = 0.80, α = 0.05)",
    x = "Effect Size (Cohen's w)",
    y = "Required Sample Size",
    fill = "Effect Category"
  ) +
  theme_minimal() +
  scale_fill_brewer(palette = "Set2")

ggsave("analysis/power-analysis-plot.png", p, width = 10, height = 6, dpi = 300)

# Calculate for our specific experimental design
# We have 3 CDNs × 2 configs × 3 browsers × 3 attacks × 4 strategies = 216 cells
# With N=20 per cell, total = 4320 trials

our_design <- list(
  cells = 216,
  trials_per_cell = 20,
  total_trials = 4320
)

# Calculate detectable effect size
detectable_effect <- pwr.chisq.test(
  N = our_design$trials_per_cell,
  df = 1,
  sig.level = 0.05,
  power = 0.80
)$w

cat("\nOur Experimental Design:\n")
cat("Cells:", our_design$cells, "\n")
cat("Trials per cell:", our_design$trials_per_cell, "\n") 
cat("Total trials:", our_design$total_trials, "\n")
cat("Detectable effect size (w):", round(detectable_effect, 3), "\n")

if (detectable_effect <= 0.3) {
  cat(" Design can detect medium effects\n")
} else {
  cat(" Design may only detect large effects\n")
}

# Power curve for different effect sizes
effect_range <- seq(0.1, 0.5, 0.05)
power_curve <- sapply(effect_range, function(w) {
  calculate_power(w, our_design$trials_per_cell)
})

power_curve_df <- data.frame(
  effect_size = effect_range,
  power = power_curve
)

p2 <- ggplot(power_curve_df, aes(x = effect_size, y = power)) +
  geom_line(color = "steelblue", size = 1.5) +
  geom_point(color = "steelblue", size = 2) +
  geom_hline(yintercept = 0.80, linetype = "dashed", color = "red") +
  geom_vline(xintercept = 0.3, linetype = "dashed", color = "orange") +
  annotate("text", x = 0.35, y = 0.85, label = "Medium effect (w=0.3)", color = "orange") +
  labs(
    title = paste("Statistical Power for N =", our_design$trials_per_cell, "per cell"),
    x = "Effect Size (Cohen's w)",
    y = "Statistical Power"
  ) +
  theme_minimal()

ggsave("analysis/power-curve.png", p2, width = 10, height = 6, dpi = 300)

# Save results to file
write.csv(power_analysis, "analysis/power-analysis-results.csv", row.names = FALSE)

cat("\nPower analysis complete. Results saved to:\n")
cat("- analysis/power-analysis-plot.png\n")
cat("- analysis/power-curve.png\n") 
cat("- analysis/power-analysis-results.csv\n")