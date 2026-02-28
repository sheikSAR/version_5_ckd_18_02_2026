function results = CKD_optimizedImputationPipeline(T)

fprintf('\n========== CKD OPTIMIZED IMPUTATION PIPELINE ==========\n')

%% VARIABLES
varsToFill = ["CHO","TRI","BMI","HB", "HBA"];
varsToFill = varsToFill(ismember(varsToFill,T.Properties.VariableNames));

X = T{:,varsToFill};
Xbest = X;

bestMethod = strings(length(varsToFill),1);
bestScore = inf(length(varsToFill),1);

methodNames = ["Mean","Median","Mode","KNN","Regression","Hybrid"];

%% =========================================================
% PROCESS EACH VARIABLE INDEPENDENTLY
%% =========================================================
for j = 1:size(X,2)

    fprintf('\nOptimizing: %s\n',varsToFill(j))

    col = X(:,j);
    miss = isnan(col);

    if sum(miss)==0
        bestMethod(j) = "No Missing";
        continue
    end

    originalStats = computeStats(col(~miss));

    candidates = cell(6,1);

    candidates{1} = meanFill(col);
    candidates{2} = medianFill(col);
    candidates{3} = modeFill(col);
    candidates{4} = knnFill(X,j);
    candidates{5} = regressionFill(X,j);
    candidates{6} = hybridFill(col);

    scores = zeros(6,1);

    for k=1:6
        scores(k) = evaluateImputation(col,candidates{k},originalStats);
    end

    [bestScore(j),idx] = min(scores);
    bestMethod(j) = methodNames(idx);
    Xbest(:,j) = candidates{idx};

    fprintf("Best → %s (score=%.4f)\n",bestMethod(j),bestScore(j))
end

%% RESULTS
results.cleanedData = array2table(Xbest,'VariableNames',varsToFill);
results.bestMethod = table(varsToFill',bestMethod,bestScore,...
    'VariableNames',{'Variable','BestMethod','Score'});

disp(results.bestMethod)

fprintf('\n✓ Optimization completed\n')

end

%% =========================================================
% STATISTICS
%% =========================================================
function s = computeStats(x)
s.mean = mean(x);
s.var = var(x);
s.skew = skewness(x);
end

%% =========================================================
% OBJECTIVE FUNCTION
%% =========================================================
function score = evaluateImputation(original,imputed,origStats)

valid = imputed(~isnan(imputed));

newStats = computeStats(valid);

score = abs(newStats.mean-origStats.mean) + ...
        abs(newStats.var-origStats.var) + ...
        abs(newStats.skew-origStats.skew);
end

%% =========================================================
% SIMPLE IMPUTATIONS
%% =========================================================
function col = meanFill(col)
col(isnan(col)) = mean(col,'omitnan');
end

function col = medianFill(col)
col(isnan(col)) = median(col,'omitnan');
end

function col = modeFill(col)
valid = col(~isnan(col));
if isempty(valid), col(:)=0; return; end
col(isnan(col)) = mode(valid);
end

function col = hybridFill(col)
valid = col(~isnan(col));
if abs(skewness(valid))>1
    col(isnan(col)) = median(valid);
else
    col(isnan(col)) = mean(valid);
end
end

%% =========================================================
% KNN (COLUMN WISE)
%% =========================================================
function col = knnFill(X,j)

Xtemp = X;

for c=1:size(Xtemp,2)
    Xtemp(:,c) = medianFill(Xtemp(:,c));
end

try
    Xk = knnimpute(Xtemp')';
    col = Xk(:,j);
catch
    col = medianFill(X(:,j));
end

end

%% =========================================================
% REGRESSION IMPUTATION
%% =========================================================
function col = regressionFill(X,j)

col = X(:,j);
miss = isnan(col);

if sum(~miss)<5
    col = medianFill(col);
    return
end

Xtrain = X(~miss,:);
ytrain = col(~miss);

Xtrain(:,j) = [];

for c=1:size(Xtrain,2)
    Xtrain(:,c) = medianFill(Xtrain(:,c));
end

try
    b = regress(ytrain,[ones(size(Xtrain,1),1) Xtrain]);
catch
    col = medianFill(col);
    return
end

Xpred = X(miss,:);
Xpred(:,j) = [];

for c=1:size(Xpred,2)
    Xpred(:,c) = medianFill(Xpred(:,c));
end

col(miss) = [ones(size(Xpred,1),1) Xpred]*b;

end