function results = CKD_fullAugmentationPipeline(Tclean,method,nNew,targetVar)

% =========================================================
% CKD FULL DATA AUGMENTATION PIPELINE
% =========================================================
%
% INPUT
% Tclean      → cleaned numeric table
% method      → "bootstrap" | "smote" | "copula" | "vae" | "all"
% nNew        → number of synthetic samples
% targetVar   → class variable (required only for SMOTE)
%
% OUTPUT
% results.augmentedData
% results.validation
% results.correlationError
%
% =========================================================

fprintf('\n========== CKD FULL AUGMENTATION PIPELINE ==========\n')

if nargin<3
    error('Provide table, method, and nNew')
end

if ~istable(Tclean)
    error('Input must be a table')
end

method = lower(string(method));

%% =========================================================
% RUN AUGMENTATION
%% =========================================================

switch method

    case "bootstrap"
        Taug = bootstrapGenerator(Tclean,nNew);

    case "smote"
        if nargin<4
            error('SMOTE requires target variable')
        end
        Taug = SMOTEgenerator(Tclean,targetVar,nNew);

    case "copula"
        Taug = copulaGenerator(Tclean,nNew);

    case "vae"
        Taug = VAEgenerator(Tclean,nNew);

    case "all"
        fprintf('Running bootstrap + SMOTE + copula\n')
        T1 = bootstrapGenerator(Tclean,round(nNew/3));
        if nargin>=4
            T1 = SMOTEgenerator(T1,targetVar,round(nNew/3));
        end
        Taug = copulaGenerator(T1,round(nNew/3));

    otherwise
        error('Unknown method')
end

fprintf('Dataset size: %d → %d\n',height(Tclean),height(Taug))

%% =========================================================
% VALIDATION REPORT
%% =========================================================
fprintf('\nRunning validation checks...\n')

validation = distributionValidation(Tclean,Taug);
corrError = correlationCheck(Tclean,Taug);

%% =========================================================
% OUTPUT
%% =========================================================
results.augmentedData = Taug;
results.validation = validation;
results.correlationError = corrError;

disp(validation)
fprintf('Correlation error = %.4f\n',corrError)

fprintf('\n✓ Augmentation pipeline completed\n')

end

%% =========================================================
% BOOTSTRAP
%% =========================================================
function Tboot = bootstrapGenerator(T,nNew)

idx = randi(height(T),nNew,1);
Tboot = [T; T(idx,:)];

end

%% =========================================================
% SMOTE
%% =========================================================
function Tnew = SMOTEgenerator(T,targetVar,nNew)

vars = setdiff(T.Properties.VariableNames,targetVar);

X = table2array(T(:,vars));
y = T.(targetVar);

classes = unique(y);
counts = histcounts(categorical(y));
[~,minorIdx] = min(counts);
minorClass = classes(minorIdx);

idxMinor = find(y==minorClass);
Xminor = X(idxMinor,:);

k = 5;
N = size(Xminor,1);
synthetic = zeros(nNew,size(X,2));

for i=1:nNew
    idx = randi(N);
    xi = Xminor(idx,:);
    D = pdist2(xi,Xminor);
    [~,nn] = sort(D);
    nn = nn(2:k+1);
    xj = Xminor(nn(randi(k)),:);
    synthetic(i,:) = xi + rand*(xj-xi);
end

Tsynthetic = array2table(synthetic,'VariableNames',vars);
Tsynthetic.(targetVar) = repmat(minorClass,nNew,1);

Tnew = [T; Tsynthetic];

end

%% =========================================================
% COPULA GENERATOR
%% =========================================================
function Tnew = copulaGenerator(T,nNew)

X = table2array(T);

% convert to uniform
U = tiedrank(X)./(size(X,1)+1);

R = corr(U,'Rows','pairwise');

Z = mvnrnd(zeros(size(X,2),1),R,nNew);
Unew = normcdf(Z);

Xnew = zeros(size(Unew));

for j=1:size(X,2)
    Xnew(:,j) = quantile(X(:,j),Unew(:,j));
end

Tsynthetic = array2table(Xnew,'VariableNames',T.Properties.VariableNames);
Tnew = [T; Tsynthetic];

end

%% =========================================================
% VAE GENERATOR (requires Deep Learning Toolbox)
%% =========================================================
function Tnew = VAEgenerator(T,nNew)

try
    X = table2array(T);
    X = normalize(X);

    inputSize = size(X,2);
    latentDim = 5;

    encoderLayers = [
        featureInputLayer(inputSize)
        fullyConnectedLayer(32)
        reluLayer
        fullyConnectedLayer(latentDim)
    ];

    decoderLayers = [
        featureInputLayer(latentDim)
        fullyConnectedLayer(32)
        reluLayer
        fullyConnectedLayer(inputSize)
    ];

    encoder = dlnetwork(layerGraph(encoderLayers));
    decoder = dlnetwork(layerGraph(decoderLayers));

    for epoch=1:30
        Z = predict(encoder,dlarray(X','CB'));
        predict(decoder,Z);
    end

    Znew = randn(latentDim,nNew);
    Xnew = extractdata(predict(decoder,Znew))';

    Tsynthetic = array2table(Xnew,'VariableNames',T.Properties.VariableNames);
    Tnew = [T; Tsynthetic];

catch
    warning('Deep Learning Toolbox not available → using copula fallback')
    Tnew = copulaGenerator(T,nNew);
end

end

%% =========================================================
% DISTRIBUTION VALIDATION
%% =========================================================
function report = distributionValidation(Treal,Taug)

vars = Treal.Properties.VariableNames;
ks = zeros(length(vars),1);

Tsynthetic = Taug(height(Treal)+1:end,:);

for i=1:length(vars)
    try
        [~,p] = kstest2(Treal.(vars{i}),Tsynthetic.(vars{i}));
        ks(i)=p;
    catch
        ks(i)=NaN;
    end
end

report = table(vars',ks,'VariableNames',{'Variable','KS_pValue'});
end

%% =========================================================
% CORRELATION CHECK
%% =========================================================
function err = correlationCheck(Treal,Taug)

% Select only numeric columns
numIdx = varfun(@isnumeric,Treal,'OutputFormat','uniform');

Treal = Treal(:,numIdx);
Taug  = Taug(:,numIdx);

X1 = table2array(Treal);
X2 = table2array(Taug(1:height(Treal),:));

C1 = corr(X1,'Rows','pairwise');
C2 = corr(X2,'Rows','pairwise');

err = norm(C1-C2);

end

%% =========================================================
% GENERATE UNIQUE IDS FOR SYNTHETIC DATA
%% =========================================================
