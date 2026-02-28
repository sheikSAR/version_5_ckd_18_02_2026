function results = CKD_researchImputationPipeline(T, useMedicalConstraint)
% =========================================================
% CKD RESEARCH IMPUTATION PIPELINE
% Bayesian optimized ensemble imputation
% =========================================================
%
% results = CKD_researchImputationPipeline(T)
% results = CKD_researchImputationPipeline(T,false) % no range constraint
% results = CKD_researchImputationPipeline(T,true)  % enforce medical ranges
%
% =========================================================

if nargin < 2
    useMedicalConstraint = false;
end

fprintf('\n========== CKD RESEARCH IMPUTATION PIPELINE ==========\n')
fprintf('Medical constraint enabled: %d\n', useMedicalConstraint)

%% =========================================================
% VARIABLES TO IMPUTE
%% =========================================================
varsToFill = ["CHO","TRI","BMI","HB","HBA"];
varsToFill = varsToFill(ismember(varsToFill,T.Properties.VariableNames));

if isempty(varsToFill)
    error('CHO, TRI, BMI, HB, HBA not found in table')
end

X = T{:,varsToFill};
Xfinal = X;
uncertainty = zeros(size(X));

ranges = getMedicalRanges(varsToFill);
summary = {};

%% =========================================================
% PROCESS EACH VARIABLE
%% =========================================================
for j = 1:size(X,2)

    fprintf('\nProcessing %s\n',varsToFill(j))

    col = X(:,j);
    miss = isnan(col);

    if sum(miss)==0
        continue
    end

    %% ---------- Generate candidate imputations
    C = generateCandidates(X,j);

    %% ---------- Cross validation scoring
    cvError = zeros(length(C),1);
    for k=1:length(C)
        cvError(k) = crossValScore(col,C{k});
    end

    %% ---------- Bayesian optimization for weights
    w = bayesianWeightSearch(C,col);

    %% ---------- Ensemble imputation
    ensemble = zeros(size(col));
    for k=1:length(C)
        ensemble = ensemble + w(k)*C{k};
    end

    %% ---------- Uncertainty estimation (method disagreement)
    N = length(col);
    K = length(C);
    stack = zeros(N,K);

    for kk = 1:K
        stack(:,kk) = C{kk};
    end

    uncertainty(:,j) = std(stack,0,2,'omitnan');

    %% ---------- Optional medical constraint
    if useMedicalConstraint
        ensemble = applyRangeConstraint(ensemble,ranges(j,:));
    end

    Xfinal(:,j) = ensemble;

    summary = [summary; {varsToFill(j),mean(cvError),sum(uncertainty(:,j),'omitnan')}];

end

%% =========================================================
% OUTPUT
%% =========================================================
%% =========================================================
% OUTPUT
%% =========================================================

% --- Return full cleaned table ---
Tclean = T;
for k = 1:length(varsToFill)
    Tclean.(varsToFill(k)) = Xfinal(:,k);
end

results.cleanedData = Tclean;
results.uncertainty = array2table(uncertainty,'VariableNames',varsToFill);

% --- FIX: safe summary creation ---
if isempty(summary)
    results.summary = table();
else
    summary = reshape(summary,[],3);  % force 3 columns
    results.summary = cell2table(summary,...
        'VariableNames',{'Variable','CV_Error','TotalUncertainty'});
end

disp(results.summary)
fprintf('\n✓ Research pipeline completed\n')
%% =========================================================
% ========== LOCAL FUNCTIONS ===============================
%% =========================================================

%% ---------- Generate candidate imputations ----------
function C = generateCandidates(X,j)
col = X(:,j);
C = cell(6,1);
C{1} = meanFill(col);
C{2} = medianFill(col);
C{3} = modeFill(col);
C{4} = knnFill(X,j);
C{5} = regressionFill(X,j);
C{6} = hybridFill(col);
end

%% ---------- Cross validation scoring ----------
function err = crossValScore(original,imputed)

validIdx = find(~isnan(original));

if length(validIdx)<10
    err = inf;
    return
end

mask = false(size(original));
idx = validIdx(randperm(length(validIdx),round(0.2*length(validIdx))));
mask(idx)=true;

trueVals = original(mask);
predVals = imputed(mask);

err = mean((trueVals-predVals).^2,'omitnan');
end

%% ---------- Bayesian optimization ----------
function wbest = bayesianWeightSearch(C,original)

K = length(C);

vars = [];
for i=1:K
    vars = [vars optimizableVariable(sprintf('w%d',i),[0 1])];
end

resultsBO = bayesopt(@(x) ensembleObjective(x,C,original,K),vars,...
    'MaxObjectiveEvaluations',20,...
    'Verbose',0,...
    'PlotFcn',[]);

wbest = zeros(1,K);
for i=1:K
    wbest(i)=resultsBO.XAtMinObjective.(sprintf('w%d',i));
end

if sum(wbest)==0
    wbest(:)=1/K;
else
    wbest=wbest/sum(wbest);
end
end

function e = ensembleObjective(x,C,original,K)

ens=zeros(size(original));

for i=1:K
    ens=ens+x.(sprintf('w%d',i))*C{i};
end

mask=~isnan(original);

if any(mask)
    e=mean((ens(mask)-original(mask)).^2,'omitnan');
else
    e=inf;
end
end

%% ---------- Medical ranges ----------
function r = getMedicalRanges(vars)

r=nan(length(vars),2);

for i=1:length(vars)
    switch vars(i)
        case "CHO"
            r(i,:)=[100 400];
        case "TRI"
            r(i,:)=[50 500];
        case "BMI"
            r(i,:)=[10 60];
        case "HB"
            r(i,:)=[5 20];
        case "HBA"
            r(i,:)=[3 15];
    end
end
end

function x=applyRangeConstraint(x,range)
low=range(1); high=range(2);
if ~isnan(low), x(x<low)=low; end
if ~isnan(high), x(x>high)=high; end
end

%% ---------- Imputation methods ----------
function c=meanFill(c)
if all(isnan(c)), c(:)=0; else c(isnan(c))=mean(c,'omitnan'); end
end

function c=medianFill(c)
if all(isnan(c)), c(:)=0; else c(isnan(c))=median(c,'omitnan'); end
end

function c=modeFill(c)
v=c(~isnan(c));
if isempty(v), c(:)=0; else c(isnan(c))=mode(v); end
end

function c=hybridFill(c)
v=c(~isnan(c));
if isempty(v), c(:)=0; return; end
if abs(skewness(v))>1
    c(isnan(c))=median(v);
else
    c(isnan(c))=mean(v);
end
end

%% ---------- KNN imputation ----------
function c=knnFill(X,j)

Xtemp=X;

for k=1:size(Xtemp,2)
    Xtemp(:,k)=medianFill(Xtemp(:,k));
end

try
    Xk=knnimpute(Xtemp')';
    c=Xk(:,j);
catch
    c=medianFill(X(:,j));
end
end

%% ---------- Regression imputation ----------
function col=regressionFill(X,j)

col=X(:,j);
miss=isnan(col);

if sum(~miss)<5
    col=medianFill(col);
    return
end

Xtrain=X(~miss,:);
ytrain=col(~miss);
Xtrain(:,j)=[];

for c=1:size(Xtrain,2)
    Xtrain(:,c)=medianFill(Xtrain(:,c));
end

try
    b=regress(ytrain,[ones(size(Xtrain,1),1) Xtrain]);
catch
    col=medianFill(col);
    return
end

Xpred=X(miss,:);
Xpred(:,j)=[];

for c=1:size(Xpred,2)
    Xpred(:,c)=medianFill(Xpred(:,c));
end

col(miss)=[ones(size(Xpred,1),1) Xpred]*b;
end

end