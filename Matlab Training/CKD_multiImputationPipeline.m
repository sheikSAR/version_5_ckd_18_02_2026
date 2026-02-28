function results = CKD_multiImputationPipeline(T)

fprintf('\n========== CKD MULTI IMPUTATION PIPELINE ==========\n')

%% =========================================================
% SETTINGS
%% =========================================================
varsToFill = ["CHO","TRI","BMI","HB","HBA"];
varsToFill = varsToFill(ismember(varsToFill,T.Properties.VariableNames));

if isempty(varsToFill)
    error('None of the variables CHO, TRI, BMI, HB found in table')
end

Xnum = T{:,varsToFill};
X_original = Xnum;

%% =========================================================
% 1. MEAN IMPUTATION
%% =========================================================
fprintf('\nRunning MEAN imputation...\n')
X_mean = fillMeanSafe(Xnum);

%% =========================================================
% 2. MEDIAN IMPUTATION
%% =========================================================
fprintf('Running MEDIAN imputation...\n')
X_median = fillMedianSafe(Xnum);

%% =========================================================
% 3. MODE IMPUTATION
%% =========================================================
fprintf('Running MODE imputation...\n')
X_mode = fillModeSafe(Xnum);

%% =========================================================
% 4. REGRESSION IMPUTATION
%% =========================================================
fprintf('Running REGRESSION imputation...\n')
X_reg = regressionImputeSafe(Xnum);

%% =========================================================
% 5. ROBUST KNN IMPUTATION
%% =========================================================
fprintf('Running ROBUST KNN imputation...\n')
X_knn = knnImputeSafe(Xnum);

%% =========================================================
% 6. HYBRID AUTO SELECTOR (SKEWNESS BASED)
%% =========================================================
fprintf('Running HYBRID selector...\n')
X_hybrid = hybridImputeSafe(Xnum);

%% =========================================================
% 7. ERROR COMPARISON
%% =========================================================
fprintf('Computing imputation errors...\n')

methods = {X_mean,X_median,X_mode,X_reg,X_knn,X_hybrid};
names = ["Mean","Median","Mode","Regression","KNN","Hybrid"];
err = zeros(length(methods),1);

for k=1:length(methods)

    Ximp = methods{k};
    mask = ~isnan(X_original);

    if any(mask(:))
        diff = Ximp(mask) - X_original(mask);
        err(k) = mean(diff.^2);
    else
        err(k) = NaN;
    end
end

errorTable = table(names',err,'VariableNames',{'Method','MSE'});
disp(errorTable)

%% =========================================================
% STORE RESULTS
%% =========================================================
results.mean = array2table(X_mean,'VariableNames',varsToFill);
results.median = array2table(X_median,'VariableNames',varsToFill);
results.mode = array2table(X_mode,'VariableNames',varsToFill);
results.regression = array2table(X_reg,'VariableNames',varsToFill);
results.knn = array2table(X_knn,'VariableNames',varsToFill);
results.hybrid = array2table(X_hybrid,'VariableNames',varsToFill);
results.errorTable = errorTable;

fprintf('\n✓ Pipeline completed successfully\n')

end

%% =========================================================
% SAFE MEAN FILL
%% =========================================================
function X = fillMeanSafe(X)

for j=1:size(X,2)
    col = X(:,j);

    if all(isnan(col))
        col(:) = 0;
    else
        col(isnan(col)) = mean(col,'omitnan');
    end

    X(:,j) = col;
end

end

%% =========================================================
% SAFE MEDIAN FILL (NO fillmissing)
%% =========================================================
function X = fillMedianSafe(X)

for j=1:size(X,2)
    col = X(:,j);

    if all(isnan(col))
        col(:) = 0;
    else
        col(isnan(col)) = median(col,'omitnan');
    end

    X(:,j) = col;
end

end

%% =========================================================
% SAFE MODE FILL
%% =========================================================
function X = fillModeSafe(X)

for j=1:size(X,2)

    col = X(:,j);
    valid = col(~isnan(col));

    if isempty(valid)
        col(:) = 0;
    else
        col(isnan(col)) = mode(valid);
    end

    X(:,j) = col;
end

end

%% =========================================================
% REGRESSION IMPUTATION (ROBUST)
%% =========================================================
function Xreg = regressionImputeSafe(X)

Xreg = X;

for j=1:size(X,2)

    y = X(:,j);
    miss = isnan(y);

    if sum(~miss) < 5
        continue
    end

    Xtrain = X(~miss,:);
    ytrain = y(~miss);

    Xtrain(:,j) = [];
    Xtrain = fillMedianSafe(Xtrain);

    try
        b = regress(ytrain,[ones(size(Xtrain,1),1) Xtrain]);
    catch
        continue
    end

    Xpred = X(miss,:);
    Xpred(:,j) = [];
    Xpred = fillMedianSafe(Xpred);

    yhat = [ones(size(Xpred,1),1) Xpred]*b;
    Xreg(miss,j) = yhat;
end

end

%% =========================================================
% ROBUST KNN IMPUTATION
%% =========================================================
function Xknn = knnImputeSafe(X)

Xknn = X;
missingMask = isnan(X);

% temporary median fill
Xtemp = fillMedianSafe(X);

try
    Xknn_temp = knnimpute(Xtemp')';
    Xknn(missingMask) = Xknn_temp(missingMask);
catch
    warning('KNN failed — falling back to median')
    Xknn = fillMedianSafe(X);
end

end

%% =========================================================
% HYBRID IMPUTATION (SKEWNESS BASED)
%% =========================================================
function Xhyb = hybridImputeSafe(X)

Xhyb = X;

for j=1:size(X,2)

    col = X(:,j);
    miss = isnan(col);
    valid = col(~miss);

    if length(valid) < 5
        continue
    end

    s = skewness(valid);

    if abs(s) > 1
        fillVal = median(valid);
    else
        fillVal = mean(valid);
    end

    col(miss) = fillVal;
    Xhyb(:,j) = col;
end

end