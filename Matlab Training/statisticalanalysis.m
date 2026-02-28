function CKD_Stats_Table=statisticalanalysis(T)

%% ==========================================
% CKD Automatic Statistical Explanation Table
% ==========================================


% Columns to analyze
variableCols = ["Durationofdiabetes","BMI","HBA","CHO","TRI","HB"];

n = length(variableCols);

Mean = zeros(n,1);
Median = zeros(n,1);
Std = zeros(n,1);
SkewnessVal = zeros(n,1);
KurtosisVal = zeros(n,1);

Distribution = strings(n,1);
OutlierRisk = strings(n,1);
RecommendedMethod = strings(n,1);

for i = 1:n
    
    % Extract column
    x = T.(variableCols(i));
    x = x(~isnan(x));   % remove NaN
    
    % ---------- Statistics ----------
    Mean(i) = mean(x);
    Median(i) = median(x);
    Std(i) = std(x);
    SkewnessVal(i) = skewness(x);
    KurtosisVal(i) = kurtosis(x);
    
    % ---------- Distribution type ----------
    if abs(SkewnessVal(i)) < 0.5
        Distribution(i) = "Approximately Normal";
    elseif abs(SkewnessVal(i)) < 1
        Distribution(i) = "Moderately Skewed";
    else
        Distribution(i) = "Highly Skewed";
    end
    
    % ---------- Outlier risk ----------
    if KurtosisVal(i) > 10
        OutlierRisk(i) = "Extreme Outliers Likely";
    elseif KurtosisVal(i) > 3
        OutlierRisk(i) = "Heavy Tails / Outliers";
    else
        OutlierRisk(i) = "Low";
    end
    
    % ---------- Recommended detection method ----------
    if abs(SkewnessVal(i)) < 0.5
        RecommendedMethod(i) = "IQR or Z-score";
    elseif abs(SkewnessVal(i)) < 1
        RecommendedMethod(i) = "IQR";
    else
        RecommendedMethod(i) = "MAD or IQR (Robust)";
    end
    
end

%% Create final explanation table
CKD_Stats_Table = table(variableCols', Mean, Median, Std, ...
                        SkewnessVal, KurtosisVal, ...
                        Distribution, OutlierRisk, ...
                        RecommendedMethod, ...
                        'VariableNames', ...
                        {'Variable','Mean','Median','Std','Skewness', ...
                         'Kurtosis','Distribution','OutlierRisk','RecommendedMethod'});

disp(CKD_Stats_Table)