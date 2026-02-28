function [T_clean, outlierReport] = boxplotOutlierProcessing(T, statsTable, methodType)
% ======================================================
% Boxplot + Distribution-Based Outlier Processing
%
% INPUT:
% T → dataset
% statsTable → output from statisticalanalysis(T)
% methodType → "winsorize" (default) or "median"
%
% OUTPUT:
% T_clean → cleaned dataset
% outlierReport → logical table of outlier locations
% ======================================================

if nargin < 3
    methodType = "winsorize";
end

methodType = string(methodType);

T_clean = T;
variables = statsTable.Variable;

%% ---------------- BOX PLOT BEFORE ----------------
figure('Name','Before Outlier Processing')
boxplot(T{:,variables})
title("Before Outlier Processing")
xtickangle(45)

outlierReport = table;

%% ---------------- PROCESS EACH VARIABLE ----------------
for i = 1:length(variables)

    varName = variables{i};
    x = T.(varName);

    if ~isnumeric(x)
        continue
    end

    xNoNaN = x(~isnan(x));
    recMethod = statsTable.RecommendedMethod{i};

    % ===== METHOD SELECTION FROM DISTRIBUTION =====
    if contains(recMethod,"MAD")

        % ---------- MAD ----------
        med = median(xNoNaN);
        MADv = mad(xNoNaN,1);
        threshold = 3*MADv;

        lowerBound = med - threshold;
        upperBound = med + threshold;

        outliers = abs(x-med) > threshold;

    elseif contains(recMethod,"Z-score")

        % ---------- Z SCORE ----------
        mu = mean(xNoNaN);
        sigma = std(xNoNaN);

        z = (x-mu)/sigma;
        outliers = abs(z) > 3;

        lowerBound = mu - 3*sigma;
        upperBound = mu + 3*sigma;

    else

        % ---------- IQR ----------
        Q1 = quantile(xNoNaN,0.25);
        Q3 = quantile(xNoNaN,0.75);
        IQRv = Q3-Q1;

        lowerBound = Q1 - 1.5*IQRv;
        upperBound = Q3 + 1.5*IQRv;

        outliers = x<lowerBound | x>upperBound;
    end

    % ===== HANDLE OUTLIERS =====
    x_new = x;

    if strcmpi(methodType,"winsorize")
        x_new(x>upperBound) = upperBound;
        x_new(x<lowerBound) = lowerBound;

    elseif strcmpi(methodType,"median")
        x_new(outliers) = median(xNoNaN);

    elseif strcmpi(methodType,"flag")
        % detect only

    else
        error("Unknown methodType")
    end

    if methodType ~= "flag"
        T_clean.(varName) = x_new;
    end

    outlierReport.(varName) = outliers;
end

%% ---------------- BOX PLOT AFTER ----------------
figure('Name','After Outlier Processing')
boxplot(T_clean{:,variables})
title("After Outlier Processing")
xtickangle(45)

fprintf("Boxplot comparison completed\n")

end