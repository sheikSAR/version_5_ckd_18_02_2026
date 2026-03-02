function exportAllModelsToJson(results, filename)
% Fully serializes all CKD models into JSON-friendly structures.
% No MAT fallback. Everything converted to numeric structs.

    if nargin < 2
        filename = 'CKD_Exported_All_Models.json';
    end

    if nargin < 1 || ~isfield(results,'models')
        error('results struct with models field is required.');
    end

    exportData = struct();

    %% ================= PERFORMANCE TABLE =================
    if isfield(results,'performance')
        exportData.Performance = results.performance;
    end

    %% ================= LINEAR MODELS =================
    linearModels = {'linear','robust','quadratic','polynomial3'};
    for i = 1:length(linearModels)
        name = linearModels{i};
        if isfield(results.models,name) && ~isempty(results.models.(name))
            mdl = results.models.(name);
            tmp = struct();
            tmp.Coefficients = mdl.Coefficients.Estimate;
            tmp.VariableNames = mdl.VariableNames;
            tmp.Formula = char(mdl.Formula);
            exportData.(upper(name)) = tmp;
        end
    end

    %% ================= REGULARIZED MODELS =================
    regModels = {'Ridge','Lasso','ElasticNet'};
    for i = 1:length(regModels)
        name = regModels{i};
        if isfield(results.models,name)
            exportData.(name) = results.models.(name);
        end
    end

    %% ================= DECISION TREE =================
    if isfield(results.models,'tree') && ~isempty(results.models.tree)
        t = results.models.tree;
        treeData = struct();
        treeData.CutPredictor = t.CutPredictor;
        treeData.CutPoint = t.CutPoint;
        treeData.Children = t.Children;
        treeData.NodeMean = t.NodeMean;
        treeData.IsBranchNode = t.IsBranchNode;
        treeData.NodeSize = t.NodeSize;
        exportData.Tree = treeData;
    end

    %% ================= ENSEMBLE =================
    if isfield(results.models,'Ensemble')
        ens = results.models.Ensemble;
        ensData = struct();
        ensData.NumTrained = ens.NumTrained;
        ensData.LearnerWeights = ens.TrainedWeights;

        trees = cell(ens.NumTrained,1);
        for i = 1:ens.NumTrained
            t = ens.Trained{i};
            trees{i} = struct( ...
                'CutPredictor', t.CutPredictor, ...
                'CutPoint', t.CutPoint, ...
                'Children', t.Children, ...
                'NodeMean', t.NodeMean, ...
                'IsBranchNode', t.IsBranchNode );
        end
        ensData.Trees = trees;

        exportData.Ensemble = ensData;
    end

    %% ================= XGBOOST =================
    if isfield(results.models,'XGBoost')
        xgb = results.models.XGBoost;
        xgbData = struct();
        xgbData.NumTrained = xgb.NumTrained;
        xgbData.LearnerWeights = xgb.TrainedWeights;
        exportData.XGBoost = xgbData;
    end

    %% ================= DNN =================
    if isfield(results.models,'DNN')
        dnn = results.models.DNN;
        dnnData = struct();

        layers = dnn.Layers;
        layerStruct = cell(length(layers),1);

        for i = 1:length(layers)
            layerStruct{i} = struct( ...
                'Name', layers(i).Name, ...
                'Type', class(layers(i)) );
        end

        dnnData.Layers = layerStruct;
        exportData.DNN = dnnData;
    end

    %% ================= METADATA =================
    exportData.Metadata = struct();
    exportData.Metadata.Timestamp = datestr(now);
    exportData.Metadata.Description = ...
        'Full CKD regression model export with performance metrics';

    %% ================= SAVE JSON =================
    jsonStr = jsonencode(exportData,'PrettyPrint',true);

    fid = fopen(filename,'w');
    if fid == -1
        error('Cannot open file for writing');
    end
    fprintf(fid,'%s\n',jsonStr);
    fclose(fid);

    fprintf('✓ Successfully exported ALL models to JSON: %s\n', filename);
end