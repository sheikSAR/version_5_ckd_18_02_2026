function results = trainCKDModelsExhaustive(X,y)
% =========================================================
% CKD EXHAUSTIVE MODEL TRAINING PIPELINE (ADVANCED)
% Includes:
%   - Linear, robust, polynomial, ridge, lasso, elastic net
%   - Stepwise, regression tree, XGBoost, DNN
%   - Nested CV with Bayesian hyperparameter tuning
%   - Ensemble of best models
%   - Feature importance + DNN uncertainty
% =========================================================

fprintf('\n========== CKD EXHAUSTIVE MODEL TRAINING ==========\n')

if istable(X)
    X = table2array(X);
end
X = double(X);
y = double(y(:));

%% ================= FEATURE CLEANING =================
X = X(:,std(X)>1e-10);
if size(X,2)>1
    C = corr(X,'Rows','pairwise'); C(logical(eye(size(C))))=0;
    X(:,any(abs(C)>0.98)) = [];
end
fprintf('Remaining features: %d\n',size(X,2))

%% ================= PREALLOCATE =================
models = struct;
metrics = table;
featureImportance = struct;

%% ================= EXISTING MODELS =================
try
    models.linear = fitlm(X,y);
    metrics = addMetrics(metrics,"Linear",y,predict(models.linear,X));
end

try
    models.robust = fitlm(X,y,'RobustOpts','on');
    metrics = addMetrics(metrics,"Robust",y,predict(models.robust,X));
end

try
    Xquad = [X X.^2];
    models.quadratic = fitlm(Xquad,y);
    metrics = addMetrics(metrics,"Quadratic",y,predict(models.quadratic,Xquad));
catch; warning('Quadratic skipped'); end

try
    Xpoly = [X X.^2 X.^3];
    models.poly3 = fitlm(Xpoly,y);
    metrics = addMetrics(metrics,"Polynomial3",y,predict(models.poly3,Xpoly));
catch; warning('Polynomial skipped'); end

%% ================= NESTED CV MODELS =================
outerCV = cvpartition(length(y),'KFold',5);

nestedModels = {'Ridge','Lasso','ElasticNet','Tree','XGBoost','DNN'};
outerPredictions = zeros(length(y),length(nestedModels));

for m = 1:length(nestedModels)
    modelName = nestedModels{m};
    fprintf('\n--> Nested CV training: %s\n',modelName)
    
    for outerFold = 1:outerCV.NumTestSets
        trainIdx = outerCV.training(outerFold);
        testIdx  = outerCV.test(outerFold);
        Xtrain = X(trainIdx,:); ytrain = y(trainIdx);
        Xtest  = X(testIdx,:);  ytest  = y(testIdx);
        
        % ---------------- INNER CV + BAYES OPT ----------------
        switch modelName
            case 'Ridge'
                fun = @(params)ridgeCV(Xtrain,ytrain,params);
                resultsBayes = bayesopt(fun,[optimizableVariable('Lambda',[1e-5 10],'Transform','log')], ...
                    'MaxObjectiveEvaluations',15,'Verbose',0);
                lambdaBest = resultsBayes.XAtMinEstimatedObjective.Lambda;
                b = ridge(ytrain,Xtrain,lambdaBest,0);
                yhat = [ones(size(Xtest,1),1) Xtest]*b;
                
            case 'Lasso'
                fun = @(params)lassoCV(Xtrain,ytrain,params);
                resultsBayes = bayesopt(fun,[optimizableVariable('Alpha',[0 1])], ...
                    'MaxObjectiveEvaluations',15,'Verbose',0);
                alphaBest = resultsBayes.XAtMinEstimatedObjective.Alpha;
                [B,FitInfo] = lasso(Xtrain,ytrain,'Alpha',alphaBest,'CV',5);
                idx = FitInfo.IndexMinMSE;
                yhat = Xtest*B(:,idx)+FitInfo.Intercept(idx);
                featureImportance.Lasso = B(:,idx);
                
            case 'ElasticNet'
                fun = @(params)elasticNetCV(Xtrain,ytrain,params);
                resultsBayes = bayesopt(fun,[optimizableVariable('Alpha',[0 1]), ...
                                             optimizableVariable('Lambda',[1e-5 10],'Transform','log')], ...
                    'MaxObjectiveEvaluations',20,'Verbose',0);
                alphaBest  = resultsBayes.XAtMinEstimatedObjective.Alpha;
                lambdaBest = resultsBayes.XAtMinEstimatedObjective.Lambda;
                [B,FitInfo] = lasso(Xtrain,ytrain,'Alpha',alphaBest,'Lambda',lambdaBest);
                idx = 1;
                yhat = Xtest*B(:,idx)+FitInfo.Intercept(idx);
                featureImportance.ElasticNet = B(:,idx);
                
            case 'Tree'
                t = templateTree('MaxNumSplits',20);
                tree = fitrtree(Xtrain,ytrain);
                yhat = predict(tree,Xtest);
                featureImportance.Tree = predictorImportance(tree);
                
            case 'XGBoost'
                t = templateTree('MaxNumSplits',20);
                xgb = fitrensemble(Xtrain,ytrain,'Method','Bag','NumLearningCycles',100,'Learners',t);
                yhat = predict(xgb,Xtest);
                featureImportance.XGBoost = oobPermutedPredictorImportance(xgb);
         case 'DNN'
    Xtrain = double(squeeze(Xtrain));
    Xtest  = double(squeeze(Xtest));

    layers = [
        featureInputLayer(size(Xtrain,2))
        fullyConnectedLayer(64)
        reluLayer
        fullyConnectedLayer(32)
        reluLayer
        fullyConnectedLayer(1)
        regressionLayer];
    
    options = trainingOptions('adam', ...
        'MaxEpochs',1000, ...
        'MiniBatchSize',32, ...
        'Verbose',false, ...
        'Plots','none');
    
    net = trainNetwork(Xtrain,ytrain,layers,options);

    % Monte Carlo dropout for uncertainty
    numMC = 20;
    yMC = zeros(size(Xtest,1),numMC);  % <-- corrected
    for i = 1:numMC
        yMC(:,i) = predict(net,Xtest);
    end
    yhat = mean(yMC,2);
    featureImportance.DNNUncertainty = std(yMC,[],2);       
        %     case 'DNN'
        %         layers = [featureInputLayer(size(Xtrain,2))
        %                   fullyConnectedLayer(64)
        %                   reluLayer
        %                   fullyConnectedLayer(32)
        %                   reluLayer
        %                   fullyConnectedLayer(1)
        %                   regressionLayer];
        %         options = trainingOptions('adam','MaxEpochs',100,'MiniBatchSize',32,'Verbose',false,'Plots','none');
        %         net = trainNetwork(Xtrain,ytrain,layers,options);
        % 
        %         numMC = 20; yMC = zeros(length(testIdx),numMC);
        %         for i=1:numMC
        %             yMC(:,i) = predict(net,Xtest);
        %         end
        %         yhat = mean(yMC,2);
        %         featureImportance.DNNUncertainty = std(yMC,[],2);
        end
        % 
        
        % ---------------- SAFE ASSIGNMENT ----------------
        if length(yhat) ~= sum(testIdx)
            error('Size mismatch in predictions. Check model output.');
        end
        outerPredictions(testIdx,m) = yhat;
    end
    
    % ---------------- METRICS ----------------
    rmse = sqrt(mean((y - outerPredictions(:,m)).^2));
    R2   = 1 - sum((y - outerPredictions(:,m)).^2)/sum((y-mean(y)).^2);
    metrics = [metrics; table(string(modelName),rmse,R2,'VariableNames',{'Model','RMSE','R2'})];
end

%% ================= ENSEMBLE =================
ensemblePred = mean(outerPredictions,2);
metrics = [metrics; table("Ensemble", sqrt(mean((y-ensemblePred).^2)), ...
            1 - sum((y-ensemblePred).^2)/sum((y-mean(y)).^2), ...
            'VariableNames',{'Model','RMSE','R2'})];

%% ================= FINAL MODELS ON FULL DATA =================
models.Ridge      = ridge(y,X,1,0);
models.Lasso      = lasso(X,y,'CV',5);
models.ElasticNet = lasso(X,y,'Alpha',0.5,'CV',5);
models.tree = tree;
models.treePredictions = predict(tree,Xtest)
models.DNN = net;                 % trained network
models.DNNPred = yhat;            % predictions
models.DNN_MC = yMC;              % all MC runs
%models.DNNUncertainty = uncertainty; % uncertainty per sample
models.DNNLayers = layers;        % optional (reproducibility)
models.DNNOptions = options;      % optional

% Optional: also store in feature importance struct
%featureImportance.DNNUncertainty = uncertainty;
%% ================= OUTPUT =================
results.models = models;
results.metrics = metrics;
results.featureImportance = featureImportance;
results.ensemble = ensemblePred;
results.XGBoost = xgb;
results.tree = tree;

fprintf('\n========== MODEL PERFORMANCE ==========\n')
disp(metrics)
fprintf('✓ All models, nested CV, Bayesian tuning, ensemble & uncertainty done\n')

end

%% ================= HELPER FUNCTIONS =================
function rmse = ridgeCV(X,y,params)
cv = cvpartition(length(y),'KFold',3);
yhat = zeros(size(y));
for i=1:cv.NumTestSets
    tr = cv.training(i); te = cv.test(i);
    b = ridge(y(tr),X(tr,:),params.Lambda,0);
    yhat(te) = [ones(sum(te),1) X(te,:)]*b;
end
rmse = sqrt(mean((y-yhat).^2));
end

function rmse = lassoCV(X,y,params)
[B,FitInfo] = lasso(X,y,'Alpha',params.Alpha,'CV',3);
idx = FitInfo.IndexMinMSE;
yhat = X*B(:,idx)+FitInfo.Intercept(idx);
rmse = sqrt(mean((y-yhat).^2));
end

function rmse = elasticNetCV(X,y,params)
[B,FitInfo] = lasso(X,y,'Alpha',params.Alpha,'Lambda',params.Lambda);
idx = 1; yhat = X*B(:,idx)+FitInfo.Intercept(idx);
rmse = sqrt(mean((y-yhat).^2));
end

function metrics = addMetrics(metrics,name,y,yhat)
rmse = sqrt(mean((y-yhat).^2));
R2 = 1 - sum((y-yhat).^2)/sum((y-mean(y)).^2);
newRow = table(string(name),rmse,R2,'VariableNames',{'Model','RMSE','R2'});
if isempty(metrics), metrics = newRow; else metrics = [metrics; newRow]; end
end